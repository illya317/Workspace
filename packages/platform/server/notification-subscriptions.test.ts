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
  assert.deepEqual(optional.map((item) => item.type), ["platform.dataQuality.alert"]);
  assert.equal(optional[0]?.ownerResourceKey, "hr.roster");
  assert.equal(optional[0]?.details.length, 4);
  assert.equal(optional[0]?.statusLabel, "未订阅");
});

test("optional subscription enabling requires target resource read", async () => {
  allowRead = false;
  const denied = await buildNotificationSubscriptionCommand({
    mode: "override",
    userId: 7,
    eventKey: "platform.dataQuality.alert",
    enabled: true,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.issue.status, 403);

  const disabling = await buildNotificationSubscriptionCommand({
    mode: "override",
    userId: 7,
    eventKey: "platform.dataQuality.alert",
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
    eventKey: "platform.dataQuality.alert",
    enabled: true,
  });
  assert.equal(command.ok, true);
  if (!command.ok) return;
  const saved = await commitNotificationSubscriptionCommand(command.data);
  assert.equal(saved.eventKey, "platform.dataQuality.alert");
  assert.equal("enabled" in saved && saved.enabled, true);
});
