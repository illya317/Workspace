import assert from "node:assert/strict";

import {
  claimWecomNotificationDeliveries,
  recordWecomNotificationDeliveryResult,
  type ClaimedWecomNotificationDelivery,
  type WecomDeliveryResultOutcome,
} from "@workspace/platform/server/notification-delivery-outbox";
import {
  buildNotificationPublicationCommand,
  commitNotificationPublication,
  type NotificationPublicationSource,
} from "@workspace/platform/server/notification-publishing";
import { prisma, Prisma } from "@workspace/platform/server/prisma";

type HealthScenario = {
  suffix: string;
  delayedOutcome: WecomDeliveryResultOutcome;
  immediateOutcome: WecomDeliveryResultOutcome;
  expectedHealth: "healthy" | "failing";
};

export async function assertWecomEndpointHealthUsesEventTime(input: {
  definitionKey: string;
  sourcePrefix: string;
  usernames: [string, string];
  token: string;
}) {
  const scenarios: HealthScenario[] = [
    {
      suffix: "older-failure-after-newer-success",
      delayedOutcome: "permanent_failure",
      immediateOutcome: "delivered",
      expectedHealth: "healthy",
    },
    {
      suffix: "older-success-after-newer-failure",
      delayedOutcome: "delivered",
      immediateOutcome: "permanent_failure",
      expectedHealth: "failing",
    },
  ];

  for (const scenario of scenarios) {
    const [delayedDelivery, immediateDelivery] = await createClaimedPair({
      ...input,
      suffix: scenario.suffix,
    });
    const endpoint = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: delayedDelivery.id },
      select: { endpointId: true },
    });
    assert.ok(endpoint.endpointId);
    await prisma.notificationChannelEndpoint.update({
      where: { id: endpoint.endpointId },
      data: {
        healthStatus: "unknown",
        lastSuccessAt: null,
        lastFailureAt: null,
        lastErrorCode: null,
        lastErrorSummary: null,
      },
    });

    const baseTime = new Date();
    const delayedTime = new Date(baseTime.getTime() + 1_000);
    const immediateTime = new Date(baseTime.getTime() + 2_000);
    const delayedAtEndpoint = createDeferredSignal();
    const releaseDelayedEndpointUpdate = createDeferredSignal();
    const delayedPromise = prisma.$transaction(async (tx) => {
      const endpointDelegate = new Proxy(tx.notificationChannelEndpoint, {
        get(target, property, receiver) {
          if (property === "updateMany") {
            return async (
              args: Parameters<typeof tx.notificationChannelEndpoint.updateMany>[0],
            ) => {
              delayedAtEndpoint.resolve();
              await releaseDelayedEndpointUpdate.wait("release delayed endpoint health update");
              return tx.notificationChannelEndpoint.updateMany(args);
            };
          }
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const delayedTx = new Proxy(tx, {
        get(target, property, receiver) {
          if (property === "notificationChannelEndpoint") return endpointDelegate;
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as Prisma.TransactionClient;
      return recordWecomNotificationDeliveryResult(
        delayedTx,
        delayedDelivery.id,
        resultInput(delayedDelivery, scenario.delayedOutcome, `${scenario.suffix}-delayed`),
        delayedTime,
      );
    });

    await delayedAtEndpoint.wait("delayed endpoint health update");
    try {
      await prisma.$transaction((tx) => recordWecomNotificationDeliveryResult(
        tx,
        immediateDelivery.id,
        resultInput(
          immediateDelivery,
          scenario.immediateOutcome,
          `${scenario.suffix}-immediate`,
        ),
        immediateTime,
      ));
    } finally {
      releaseDelayedEndpointUpdate.resolve();
    }
    await delayedPromise;

    const finalEndpoint = await prisma.notificationChannelEndpoint.findUniqueOrThrow({
      where: { id: endpoint.endpointId },
      select: {
        healthStatus: true,
        lastSuccessAt: true,
        lastFailureAt: true,
      },
    });
    assert.equal(finalEndpoint.healthStatus, scenario.expectedHealth);
    if (scenario.immediateOutcome === "delivered") {
      assert.equal(finalEndpoint.lastSuccessAt?.toISOString(), immediateTime.toISOString());
      assert.equal(finalEndpoint.lastFailureAt, null);
    } else {
      assert.equal(finalEndpoint.lastFailureAt?.toISOString(), immediateTime.toISOString());
      assert.equal(finalEndpoint.lastSuccessAt, null);
    }
  }
  console.log("✓ endpoint health is ordered by result event time across publications");
}

async function createClaimedPair(input: {
  definitionKey: string;
  sourcePrefix: string;
  usernames: [string, string];
  token: string;
  suffix: string;
}) {
  const publicationIds: string[] = [];
  for (const [index, username] of input.usernames.entries()) {
    const source: NotificationPublicationSource = {
      kind: "user-api",
      id: `${input.sourcePrefix}-${input.suffix}-${index}`,
      label: `Endpoint health ${input.suffix} ${index}`,
    };
    const command = await buildNotificationPublicationCommand({
      source,
      request: {
        definitionKey: input.definitionKey,
        idempotencyKey: `endpoint-health-${input.token}-${input.suffix}-${index}`,
        usernames: [username],
        variables: { message: `endpoint-health-${input.suffix}-${index}` },
      },
      deliveryChannels: ["wecom"],
    });
    assert.equal(command.ok, true);
    if (!command.ok || command.data.kind !== "publish") {
      throw new Error("endpoint health fixture expected a publish command");
    }
    const committed = await commitNotificationPublication(command.data, async () => {
      throw new Error("WeCom-only publication must not write a workspace projection");
    });
    if (!committed.ok) throw new Error(committed.error);
    publicationIds.push(committed.data.publicationId);
  }

  const claims = await prisma.$transaction((tx) => (
    claimWecomNotificationDeliveries(tx, { limit: 50 })
  ));
  return publicationIds.map((publicationId) => {
    const delivery = claims.find((item) => item.publicationId === publicationId);
    assert.ok(delivery, `delivery for ${publicationId} is leased`);
    return delivery;
  }) as [ClaimedWecomNotificationDelivery, ClaimedWecomNotificationDelivery];
}

function resultInput(
  delivery: ClaimedWecomNotificationDelivery,
  outcome: WecomDeliveryResultOutcome,
  suffix: string,
) {
  return {
    leaseToken: delivery.leaseToken,
    attemptNo: delivery.attemptNo,
    outcome,
    ...(outcome === "delivered"
      ? { providerMessageId: `provider-${suffix}` }
      : {
          errorCode: "PROVIDER_REJECTED",
          errorSummary: `provider rejected ${suffix}`,
        }),
  };
}

function createDeferredSignal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    resolve,
    wait: (label: string) => withTimeout(promise, 5_000, label),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
