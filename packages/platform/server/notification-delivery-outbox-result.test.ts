import assert from "node:assert/strict";
import test, { mock } from "node:test";

const operations: string[] = [];
const attempts: Array<{ attemptNo: number; resultFingerprint: string }> = [];
const delivery = {
  id: 17,
  publicationId: "publication-1",
  channel: "wecom",
  status: "leased",
  leaseToken: "11111111-1111-4111-8111-111111111111",
  leaseExpiresAt: new Date("2026-07-31T10:02:00.000Z"),
  attemptCount: 1,
  nextAttemptAt: null as Date | null,
  deliveredAt: null as Date | null,
  failedAt: null as Date | null,
  endpointId: 9,
};

mock.module("./prisma", {
  namedExports: {
    Prisma: {
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    },
    prisma: {},
  },
} as never);

mock.module("./wecom-notification-worker-auth", {
  namedExports: { WECOM_NOTIFICATION_ENDPOINT_KEY: "wecom.primary" },
} as never);

const {
  NotificationDeliveryOutboxError,
  recordWecomNotificationDeliveryResult,
} = await import("./notification-delivery-outbox");

const client = {
  $queryRaw: async (query: { strings: readonly string[] }) => {
    const sql = query.strings.join("?");
    if (/FOR UPDATE OF publication/.test(sql)) {
      operations.push("publication-lock");
      return [{ id: delivery.publicationId }];
    }
    operations.push("delivery-lock");
    assert.match(sql, /FOR UPDATE OF delivery/);
    return [{ id: delivery.id }];
  },
  notificationDelivery: {
    findUnique: async () => {
      operations.push("read");
      return {
        ...delivery,
        attempts: attempts.filter((attempt) => attempt.attemptNo === delivery.attemptCount),
      };
    },
    update: async ({ data }: { data: Partial<typeof delivery> }) => {
      Object.assign(delivery, data);
      return { ...delivery };
    },
    groupBy: async () => [{ channel: "wecom", status: delivery.status, _count: { _all: 1 } }],
  },
  notificationDeliveryAttempt: {
    create: async ({ data }: { data: { attemptNo: number; resultFingerprint: string } }) => {
      attempts.push({ attemptNo: data.attemptNo, resultFingerprint: data.resultFingerprint });
      return data;
    },
  },
  notificationChannelEndpoint: {
    upsert: async () => ({ id: 9, status: "active", key: "wecom.primary" }),
    updateMany: async () => {
      operations.push("endpoint-update");
      return { count: 1 };
    },
  },
  notificationPublication: { update: async () => ({ id: delivery.publicationId }) },
} as never;

test("result processing locks the delivery row and replays only the same immutable result", async () => {
  const result = {
    leaseToken: delivery.leaseToken,
    attemptNo: 1,
    outcome: "delivered" as const,
    providerMessageId: "provider-1",
  };
  const first = await recordWecomNotificationDeliveryResult(
    client,
    delivery.id,
    result,
    new Date("2026-07-31T10:01:00.000Z"),
  );
  assert.equal(first.replayed, false);
  assert.deepEqual(operations.slice(0, 4), [
    "delivery-lock",
    "read",
    "publication-lock",
    "endpoint-update",
  ]);

  const replay = await recordWecomNotificationDeliveryResult(
    client,
    delivery.id,
    result,
    new Date("2026-07-31T10:01:01.000Z"),
  );
  assert.equal(replay.replayed, true);

  await assert.rejects(
    recordWecomNotificationDeliveryResult(client, delivery.id, {
      ...result,
      outcome: "permanent_failure",
      errorCode: "PROVIDER_REJECTED",
    }, new Date("2026-07-31T10:01:02.000Z")),
    (error: unknown) => error instanceof NotificationDeliveryOutboxError
      && error.status === 409
      && error.code === "DELIVERY_RESULT_CONFLICT",
  );
});
