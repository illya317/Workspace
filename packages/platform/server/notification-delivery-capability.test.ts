import assert from "node:assert/strict";
import test, { mock } from "node:test";

let endpoint: {
  runtimeBindingKey: string;
  status: string;
  healthStatus: string;
  lastHeartbeatAt: Date;
} | null = null;
let endpointReads = 0;

mock.module("./prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      notificationChannelEndpoint: {
        findUnique: async () => {
          endpointReads += 1;
          return endpoint;
        },
      },
    },
  },
} as never);

mock.module("./wecom-notification-worker-auth", {
  namedExports: { WECOM_NOTIFICATION_ENDPOINT_KEY: "wecom.primary" },
} as never);

const {
  validateNotificationDeliveryChannelsForActivation,
  WECOM_NOTIFICATION_RUNTIME_BINDING_KEY,
} = await import("./notification-delivery-outbox");

test("workspace activation has no WeCom dependency", async () => {
  endpointReads = 0;
  assert.deepEqual(await validateNotificationDeliveryChannelsForActivation(["workspace"]), {
    ok: true,
    data: true,
  });
  assert.equal(endpointReads, 0);
});

test("WeCom activation fails closed until secret, endpoint, and fresh healthy heartbeat exist", async () => {
  const previous = process.env.WECOM_WORKER_BRIDGE_SECRET;
  const now = new Date("2026-07-31T10:00:00.000Z");
  try {
    delete process.env.WECOM_WORKER_BRIDGE_SECRET;
    assert.equal((await validateNotificationDeliveryChannelsForActivation(["wecom"], now)).ok, false);

    process.env.WECOM_WORKER_BRIDGE_SECRET = "worker-bridge-test-secret-32-bytes-minimum";
    endpoint = null;
    assert.equal((await validateNotificationDeliveryChannelsForActivation(["wecom"], now)).ok, false);

    endpoint = {
      runtimeBindingKey: WECOM_NOTIFICATION_RUNTIME_BINDING_KEY,
      status: "active",
      healthStatus: "healthy",
      lastHeartbeatAt: new Date("2026-07-31T09:54:59.999Z"),
    };
    assert.equal((await validateNotificationDeliveryChannelsForActivation(["wecom"], now)).ok, false);

    endpoint.lastHeartbeatAt = new Date("2026-07-31T09:59:00.000Z");
    assert.deepEqual(await validateNotificationDeliveryChannelsForActivation(["workspace", "wecom"], now), {
      ok: true,
      data: true,
    });
  } finally {
    if (previous === undefined) delete process.env.WECOM_WORKER_BRIDGE_SECRET;
    else process.env.WECOM_WORKER_BRIDGE_SECRET = previous;
  }
});
