import assert from "node:assert/strict";

import {
  claimWecomNotificationDeliveries,
  recordWecomNotificationDeliveryResult,
  WECOM_DELIVERY_MAX_ATTEMPTS,
} from "@workspace/platform/server/notification-delivery-outbox";
import {
  buildNotificationPublicationCommand,
  commitNotificationPublication,
  type NotificationPublicationSource,
} from "@workspace/platform/server/notification-publishing";
import { prisma, Prisma } from "@workspace/platform/server/prisma";

export async function assertConcurrentWecomDeliveryResultAggregation(input: {
  definitionKey: string;
  idempotencyKey: string;
  source: NotificationPublicationSource;
  usernames: [string, string];
  token: string;
}) {
  const command = await buildNotificationPublicationCommand({
    source: input.source,
    request: {
      definitionKey: input.definitionKey,
      idempotencyKey: input.idempotencyKey,
      usernames: input.usernames,
      variables: { message: "concurrent-result-aggregation" },
    },
    deliveryChannels: ["wecom"],
  });
  assert.equal(command.ok, true, "concurrent WeCom result command builds");
  if (!command.ok || command.data.kind !== "publish") {
    throw new Error("concurrent WeCom result fixture expected a publish command");
  }
  const committed = await commitNotificationPublication(
    command.data,
    async () => {
      throw new Error("WeCom-only publication must not write a workspace projection");
    },
  );
  if (!committed.ok) throw new Error(committed.error);
  console.log("✓ concurrent WeCom result fixture commits");

  const claimed = await prisma.$transaction((tx) => (
    claimWecomNotificationDeliveries(tx, { limit: 2 })
  ));
  const deliveries = claimed.filter((item) => item.publicationId === committed.data.publicationId);
  assert.equal(deliveries.length, 2, "both WeCom deliveries are leased");

  const waitForBothDeliveryUpdates = createTwoPartyBarrier();
  await Promise.all(deliveries.map((delivery, index) => prisma.$transaction(async (tx) => {
    const deliveryDelegate = new Proxy(tx.notificationDelivery, {
      get(target, property, receiver) {
        if (property === "update") {
          return async (args: Parameters<typeof tx.notificationDelivery.update>[0]) => {
            const result = await tx.notificationDelivery.update(args);
            await waitForBothDeliveryUpdates();
            return result;
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const endpointDelegate = new Proxy(tx.notificationChannelEndpoint, {
      get(target, property, receiver) {
        if (property === "update") return async () => ({ id: 0 });
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const synchronizedTx = new Proxy(tx, {
      get(target, property, receiver) {
        if (property === "notificationDelivery") return deliveryDelegate;
        if (property === "notificationChannelEndpoint") return endpointDelegate;
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Prisma.TransactionClient;
    return recordWecomNotificationDeliveryResult(
      synchronizedTx,
      delivery.id,
      {
        leaseToken: delivery.leaseToken,
        attemptNo: delivery.attemptNo,
        outcome: "delivered",
        providerMessageId: `provider-${input.token}-${index + 1}`,
      },
    );
  })));

  assert.deepEqual(
    await prisma.notificationPublication.findUniqueOrThrow({
      where: { id: committed.data.publicationId },
      select: {
        status: true,
        deliveryCount: true,
        pendingDeliveryCount: true,
        deliveredDeliveryCount: true,
        failedDeliveryCount: true,
      },
    }),
    {
      status: "delivered",
      deliveryCount: 2,
      pendingDeliveryCount: 0,
      deliveredDeliveryCount: 2,
      failedDeliveryCount: 0,
    },
    "concurrent result transactions preserve the final publication aggregate",
  );
  console.log("✓ concurrent WeCom result aggregation is serialized by publication");
}

export async function assertResultAndExpiredClaimShareLockOrder(input: {
  definitionKey: string;
  idempotencyKey: string;
  source: NotificationPublicationSource;
  usernames: [string, string];
  token: string;
}) {
  const command = await buildNotificationPublicationCommand({
    source: input.source,
    request: {
      definitionKey: input.definitionKey,
      idempotencyKey: input.idempotencyKey,
      usernames: input.usernames,
      variables: { message: "result-expired-claim-lock-order" },
    },
    deliveryChannels: ["wecom"],
  });
  assert.equal(command.ok, true, "result/claim lock-order command builds");
  if (!command.ok || command.data.kind !== "publish") {
    throw new Error("result/claim lock-order fixture expected a publish command");
  }
  const committed = await commitNotificationPublication(
    command.data,
    async () => {
      throw new Error("WeCom-only publication must not write a workspace projection");
    },
  );
  if (!committed.ok) throw new Error(committed.error);

  const initialClaims = await prisma.$transaction((tx) => (
    claimWecomNotificationDeliveries(tx, { limit: 50 })
  ));
  const deliveries = initialClaims.filter(
    (item) => item.publicationId === committed.data.publicationId,
  );
  assert.equal(deliveries.length, 2, "result/claim fixture leases both deliveries");
  const [resultDelivery, expiringDelivery] = deliveries;
  assert.ok(resultDelivery);
  assert.ok(expiringDelivery);

  const raceNow = new Date();
  await prisma.$transaction([
    prisma.notificationDelivery.update({
      where: { id: resultDelivery.id },
      data: { leaseExpiresAt: new Date(raceNow.getTime() + 120_000) },
    }),
    prisma.notificationDelivery.update({
      where: { id: expiringDelivery.id },
      data: {
        attemptCount: WECOM_DELIVERY_MAX_ATTEMPTS,
        leaseExpiresAt: new Date(raceNow.getTime() - 1_000),
      },
    }),
  ]);

  const endpointResolved = createDeferredSignal();
  const publicationLocked = createDeferredSignal();

  const claimPromise = prisma.$transaction(async (tx) => {
    const endpointDelegate = new Proxy(tx.notificationChannelEndpoint, {
      get(target, property, receiver) {
        if (property === "findUnique" || property === "upsert") {
          return async (args: never) => {
            const operation = Reflect.get(target, property, receiver) as (
              operationArgs: never,
            ) => Promise<unknown>;
            const endpoint = await operation.call(target, args);
            endpointResolved.resolve();
            await publicationLocked.wait("publication row lock");
            return endpoint;
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const synchronizedTx = new Proxy(tx, {
      get(target, property, receiver) {
        if (property === "notificationChannelEndpoint") return endpointDelegate;
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Prisma.TransactionClient;
    return claimWecomNotificationDeliveries(synchronizedTx, {
      limit: 50,
      now: raceNow,
    });
  });

  await endpointResolved.wait("endpoint resolution");
  const resultPromise = prisma.$transaction(async (tx) => {
    const synchronizedTx = new Proxy(tx, {
      get(target, property, receiver) {
        if (property === "$queryRaw") {
          return async (query: { strings?: readonly string[] }) => {
            const rows = await tx.$queryRaw(query as never);
            if (query.strings?.join("?").includes("FOR UPDATE OF publication")) {
              publicationLocked.resolve();
            }
            return rows;
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Prisma.TransactionClient;
    return recordWecomNotificationDeliveryResult(
      synchronizedTx,
      resultDelivery.id,
      {
        leaseToken: resultDelivery.leaseToken,
        attemptNo: resultDelivery.attemptNo,
        outcome: "delivered",
        providerMessageId: `provider-lock-order-${input.token}`,
      },
      raceNow,
    );
  });

  await withTimeout(
    Promise.all([claimPromise, resultPromise]),
    10_000,
    "result-vs-expired-claim concurrency",
  );
  assert.deepEqual(
    await prisma.notificationPublication.findUniqueOrThrow({
      where: { id: committed.data.publicationId },
      select: {
        status: true,
        deliveryCount: true,
        pendingDeliveryCount: true,
        deliveredDeliveryCount: true,
        failedDeliveryCount: true,
      },
    }),
    {
      status: "partial",
      deliveryCount: 2,
      pendingDeliveryCount: 0,
      deliveredDeliveryCount: 1,
      failedDeliveryCount: 1,
    },
    "result and expired-claim transactions preserve the final aggregate",
  );
  console.log("✓ result and expired claim use delivery → publication → endpoint lock order");
}

function createTwoPartyBarrier() {
  let arrivals = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrivals += 1;
    if (arrivals === 2) release();
    let timeout: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        gate,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("concurrent delivery result barrier timed out")),
            5_000,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
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
