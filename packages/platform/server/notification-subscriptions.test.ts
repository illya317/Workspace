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
const customDefinitions = [{
  id: 91,
  key: "custom.operations.reminder",
  label: "运营提醒",
  description: "按发布请求指定收件人",
  revision: 3,
  variableKeys: ["project_name"],
  responseMode: "acknowledge" as const,
  isImportant: true,
}];

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

mock.module("./notification-publishing", {
  namedExports: {
    commitNotificationPublication: async () => ({ ok: false }),
    listPublishedNotificationDefinitionsForSource: async () => customDefinitions,
  },
} as never);

const {
  buildNotificationSubscriptionCommand,
  listNotificationSubscriptionCatalog,
} = await import("./notification-subscriptions");

test("catalog exposes only required assigned or governance notifications", async () => {
  allowRead = true;
  const catalog = await listNotificationSubscriptionCatalog(7);
  assert.equal(catalog.length, 9);
  assert.deepEqual(catalog.filter((item) => item.subscriptionMode === "optional"), []);
  const custom = catalog.find((item) => item.type === "custom.operations.reminder");
  assert.ok(custom);
  assert.equal(custom.groupKey, "custom");
  assert.equal(custom.subscriptionMode, "required");
  assert.equal(custom.selectedEnabled, true);
  assert.equal(custom.effectiveEnabled, true);
  assert.equal(custom.canConfigure, false);
  assert.equal(custom.requiresAcknowledgement, true);
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

test("published custom notifications are assigned and cannot be disabled", async () => {
  allowRead = true;
  const command = await buildNotificationSubscriptionCommand({
    mode: "override",
    userId: 7,
    eventKey: "custom.operations.reminder",
    enabled: false,
  });
  assert.equal(command.ok, false);
  if (!command.ok) assert.equal(command.issue.status, 409);
});
