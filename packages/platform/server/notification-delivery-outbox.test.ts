import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveNotificationPublicationStatus,
  ensureWecomNotificationEndpoint,
  notificationDeliveryRetryDelayMs,
  recordWecomNotificationWorkerHeartbeat,
  sanitizeWorkerErrorSummary,
} from "./notification-delivery-outbox";

test("a connectivity heartbeat only heals unknown or disconnected endpoint state", async () => {
  const updates: Array<{ operation: string; args: unknown }> = [];
  let endpointReadCount = 0;
  const client = {
    notificationChannelEndpoint: {
      upsert: async () => ({ id: 9, key: "wecom.primary", status: "active" }),
      updateMany: async (args: unknown) => {
        updates.push({ operation: "updateMany", args });
        return { count: 0 };
      },
      findUnique: async () => {
        endpointReadCount += 1;
        return endpointReadCount === 1
          ? { id: 9, key: "wecom.primary", status: "active", healthStatus: "degraded" }
          : { healthStatus: "degraded" };
      },
    },
    notificationDeliveryWorkerRequest: {
      deleteMany: async () => ({ count: 0 }),
    },
  } as never;
  const heartbeat = await recordWecomNotificationWorkerHeartbeat(client, {
    workerId: "worker-1",
    connected: true,
  }, new Date("2026-07-31T10:00:00.000Z"));

  assert.deepEqual(updates, [
    {
      operation: "updateMany",
      args: {
        where: {
          id: 9,
          OR: [
            { lastHeartbeatAt: null },
            { lastHeartbeatAt: { lte: new Date("2026-07-31T10:00:00.000Z") } },
          ],
        },
        data: { lastHeartbeatAt: new Date("2026-07-31T10:00:00.000Z") },
      },
    },
    {
      operation: "updateMany",
      args: {
        where: {
          id: 9,
          healthStatus: { in: ["unknown", "disconnected"] },
          AND: [
            {
              OR: [
                { lastSuccessAt: null },
                { lastSuccessAt: { lte: new Date("2026-07-31T10:00:00.000Z") } },
              ],
            },
            {
              OR: [
                { lastFailureAt: null },
                { lastFailureAt: { lt: new Date("2026-07-31T10:00:00.000Z") } },
              ],
            },
          ],
        },
        data: {
          healthStatus: "healthy",
          lastErrorCode: null,
          lastErrorSummary: null,
        },
      },
    },
  ]);
  assert.equal(heartbeat.healthStatus, "degraded");
});

test("an existing endpoint is resolved without taking an update lock", async () => {
  let upserts = 0;
  const endpoint = { id: 9, key: "wecom.primary", status: "active" };
  const client = {
    notificationChannelEndpoint: {
      findUnique: async () => endpoint,
      upsert: async () => {
        upserts += 1;
        return endpoint;
      },
    },
  } as never;

  assert.equal(await ensureWecomNotificationEndpoint(client), endpoint);
  assert.equal(upserts, 0);
});

test("publication status reflects workspace and asynchronous channel outcomes", () => {
  assert.equal(deriveNotificationPublicationStatus({
    channels: ["workspace"], pending: 0, delivered: 2, failed: 0,
  }), "committed");
  assert.equal(deriveNotificationPublicationStatus({
    channels: ["wecom"], pending: 2, delivered: 0, failed: 0,
  }), "processing");
  assert.equal(deriveNotificationPublicationStatus({
    channels: ["workspace", "wecom"], pending: 0, delivered: 2, failed: 1,
  }), "partial");
  assert.equal(deriveNotificationPublicationStatus({
    channels: ["wecom"], pending: 0, delivered: 0, failed: 2,
  }), "failed");
  assert.equal(deriveNotificationPublicationStatus({
    channels: ["wecom"], pending: 0, delivered: 2, failed: 0,
  }), "delivered");
});

test("retry schedule is bounded and worker errors redact credentials and URLs", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(notificationDeliveryRetryDelayMs), [
    30_000,
    120_000,
    600_000,
    1_800_000,
    7_200_000,
    7_200_000,
  ]);
  const sanitized = sanitizeWorkerErrorSummary(
    "authorization=Bearer-secret token:abc secret=qwerty key=xyz https://provider.invalid/error",
  );
  assert.equal(sanitized, "authorization=[redacted] token=[redacted] secret=[redacted] key=[redacted] [url-redacted]");
});
