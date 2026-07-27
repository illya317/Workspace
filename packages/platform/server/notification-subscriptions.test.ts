import assert from "node:assert/strict";
import test, { mock } from "node:test";

let allowRead = true;
const overrides: Array<{
  id: number;
  eventKey: string;
  enabled: boolean;
  channel: string;
  cadence: string;
  updatedAt: Date;
}> = [];

mock.module("./auth", {
  namedExports: {
    authorize: async () => allowRead,
  },
} as never);

mock.module("./prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      notificationSubscription: {
        findMany: async () => overrides,
        deleteMany: async () => ({ count: 1 }),
        upsert: async ({ create }: { create: Record<string, unknown> }) => ({
          id: 1,
          ...create,
          updatedAt: new Date("2026-07-27T10:00:00.000Z"),
        }),
      },
    },
  },
} as never);

const {
  buildNotificationSubscriptionCommand,
  commitNotificationSubscriptionCommand,
  listNotificationSubscriptionCatalog,
} = await import("./notification-subscriptions");

test("catalog exposes every registered notification and only business-data alerts are optional", async () => {
  allowRead = true;
  const catalog = await listNotificationSubscriptionCatalog(7);
  assert.equal(catalog.length, 9);
  const optional = catalog.filter((item) => item.subscriptionMode === "optional");
  assert.deepEqual(optional.map((item) => item.type), ["platform.businessData.alert"]);
  assert.equal(optional[0]?.ownerResourceKey, "hr.roster");
  assert.equal(optional[0]?.details.length, 4);
  assert.equal(optional[0]?.producerMode, "scheduled_and_event");
  assert.equal(optional[0]?.producerAvailable, true);
  assert.deepEqual(optional[0]?.availableChannels, ["workspace"]);
  assert.equal(optional[0]?.deliveryAvailable, true);
  assert.equal(optional[0]?.runtimeAvailable, true);
  assert.equal(optional[0]?.statusLabel, "未订阅");
});

test("optional subscription is unavailable when its automatic producer is disabled", async () => {
  allowRead = true;
  const previous = process.env.DATA_QUALITY_SCHEDULER_DISABLED;
  process.env.DATA_QUALITY_SCHEDULER_DISABLED = "1";
  try {
    const catalog = await listNotificationSubscriptionCatalog(7);
    const dataQuality = catalog.find((item) => item.type === "platform.businessData.alert");
    assert.equal(dataQuality?.producerAvailable, false);
    assert.equal(dataQuality?.runtimeAvailable, false);
    assert.equal(dataQuality?.canConfigure, false);
    assert.equal(dataQuality?.statusLabel, "自动触发未运行");

    const command = await buildNotificationSubscriptionCommand({
      mode: "override",
      userId: 7,
      eventKey: "platform.businessData.alert",
      enabled: true,
    });
    assert.equal(command.ok, false);
    if (!command.ok) assert.equal(command.issue.status, 409);
  } finally {
    if (previous === undefined) delete process.env.DATA_QUALITY_SCHEDULER_DISABLED;
    else process.env.DATA_QUALITY_SCHEDULER_DISABLED = previous;
  }
});

test("optional subscription enabling requires target resource read", async () => {
  allowRead = false;
  const denied = await buildNotificationSubscriptionCommand({
    mode: "override",
    userId: 7,
    eventKey: "platform.businessData.alert",
    enabled: true,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.issue.status, 403);

  const disabling = await buildNotificationSubscriptionCommand({
    mode: "override",
    userId: 7,
    eventKey: "platform.businessData.alert",
    enabled: false,
  });
  assert.equal(disabling.ok, true);
});

test("assigned and governance notifications cannot be overridden", async () => {
  allowRead = true;
  for (const eventKey of ["approval.request.submitted", "security.permissionReview.alert"]) {
    const command = await buildNotificationSubscriptionCommand({
      mode: "override",
      userId: 7,
      eventKey,
      enabled: false,
    });
    assert.equal(command.ok, false, eventKey);
    if (!command.ok) assert.equal(command.issue.status, 409);
  }
});

test("validated optional override commits through the normalized subscription tuple", async () => {
  allowRead = true;
  const command = await buildNotificationSubscriptionCommand({
    mode: "override",
    userId: 7,
    eventKey: "platform.businessData.alert",
    enabled: true,
  });
  assert.equal(command.ok, true);
  if (!command.ok) return;
  const saved = await commitNotificationSubscriptionCommand(command.data);
  assert.equal(saved.eventKey, "platform.businessData.alert");
  assert.equal("enabled" in saved && saved.enabled, true);
});
