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
  listNotificationSubscriptionCatalog,
} = await import("./notification-subscriptions");

test("catalog exposes only required assigned or governance notifications", async () => {
  allowRead = true;
  const catalog = await listNotificationSubscriptionCatalog(7);
  assert.equal(catalog.length, 8);
  assert.deepEqual(catalog.filter((item) => item.subscriptionMode === "optional"), []);
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

test("retired HR integrity events cannot be subscribed", async () => {
  allowRead = true;
  const command = await buildNotificationSubscriptionCommand({
    mode: "override",
    userId: 7,
    eventKey: "hr.active-employment.unique",
    enabled: true,
  });
  assert.equal(command.ok, false);
  if (!command.ok) assert.equal(command.issue.status, 404);
});
