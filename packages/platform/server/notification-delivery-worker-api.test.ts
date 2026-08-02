import assert from "node:assert/strict";
import test, { mock } from "node:test";

const delivery = {
  id: 17,
  publicationId: "publication-1",
  attemptNo: 1,
  leaseToken: "11111111-1111-4111-8111-111111111111",
  leaseExpiresAt: "2026-07-31T10:02:00.000Z",
  destination: "wx-user-1",
  title: "项目提醒",
  body: "项目已逾期",
  href: "/work/projects/1",
};

class MockOutboxError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const tx = {
  notificationDeliveryWorkerRequest: {
    findUnique: async () => null,
    create: async () => ({ id: "stored" }),
  },
};

mock.module("./prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
      notificationChannelEndpoint: { findUnique: async () => ({ id: 9 }) },
      notificationDeliveryWorkerRequest: { findUnique: async () => null },
    },
  },
} as never);

mock.module("./notification-delivery-outbox", {
  namedExports: {
    claimWecomNotificationDeliveries: async () => [delivery],
    ensureWecomNotificationEndpoint: async () => ({ id: 9 }),
    NotificationDeliveryOutboxError: MockOutboxError,
    recordWecomNotificationDeliveryResult: async () => ({
      deliveryId: delivery.id,
      publicationId: delivery.publicationId,
      status: "delivered",
      attemptCount: 1,
      nextAttemptAt: null,
      deliveredAt: "2026-07-31T10:00:00.000Z",
      failedAt: null,
      replayed: false,
    }),
    recordWecomNotificationWorkerHeartbeat: async (_client: unknown, body: { workerId: string }) => ({
      endpointKey: "wecom.primary",
      workerId: body.workerId,
      enabled: true,
      connected: true,
      healthStatus: "healthy",
      workerVersion: "1.0.0",
      heartbeatAt: "2026-07-31T10:00:00.000Z",
    }),
  },
} as never);

mock.module("./wecom-notification-worker-auth", {
  namedExports: {
    WECOM_NOTIFICATION_ENDPOINT_KEY: "wecom.primary",
    authenticateWecomNotificationWorkerRequest: (request: Request) => ({
      ok: true,
      endpointKey: "wecom.primary",
      requestId: request.headers.get("x-test-request-id") ?? "request-default",
    }),
  },
} as never);

const {
  handleWecomNotificationClaimRequest,
  handleWecomNotificationDeliveryResultRequest,
  handleWecomNotificationHeartbeatRequest,
} = await import("./notification-delivery-worker-api");

test("claim requires workerId and returns frozen flat deliveries DTO", async () => {
  const invalid = await handleWecomNotificationClaimRequest(jsonRequest("claim-invalid", { limit: 20 }));
  assert.equal(invalid.status, 400);

  const response = await handleWecomNotificationClaimRequest(jsonRequest("claim-valid", {
    workerId: "worker-a",
    limit: 20,
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { endpointKey: "wecom.primary", deliveries: [delivery] });
});

test("result and heartbeat require workerId", async () => {
  const invalidResult = await handleWecomNotificationDeliveryResultRequest(
    jsonRequest("result-invalid", {
      leaseToken: delivery.leaseToken,
      attemptNo: 1,
      outcome: "delivered",
    }),
    String(delivery.id),
  );
  assert.equal(invalidResult.status, 400);

  const result = await handleWecomNotificationDeliveryResultRequest(
    jsonRequest("result-valid", {
      workerId: "worker-a",
      leaseToken: delivery.leaseToken,
      attemptNo: 1,
      outcome: "delivered",
    }),
    String(delivery.id),
  );
  assert.equal(result.status, 200);
  assert.equal((await result.json()).deliveryId, delivery.id);

  const invalidHeartbeat = await handleWecomNotificationHeartbeatRequest(
    jsonRequest("heartbeat-invalid", { connected: true }),
  );
  assert.equal(invalidHeartbeat.status, 400);
  const heartbeat = await handleWecomNotificationHeartbeatRequest(jsonRequest("heartbeat-valid", {
    workerId: "worker-a",
    connected: true,
    workerVersion: "1.0.0",
  }));
  assert.equal(heartbeat.status, 200);
  assert.equal((await heartbeat.json()).workerId, "worker-a");
});

function jsonRequest(requestId: string, body: Record<string, unknown>) {
  return new Request("https://workspace.invalid/test/api/integrations/wecom/notifications/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-request-id": requestId,
    },
    body: JSON.stringify(body),
  });
}
