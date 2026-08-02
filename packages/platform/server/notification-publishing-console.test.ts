import assert from "node:assert/strict";
import test, { mock } from "node:test";

let grants = { read: true, configure: true, audit: true };
let lifecycleReads = 0;
const lifecycleEvent = {
  id: "event-1",
  definitionId: 9,
  definitionKey: "custom.project.deadline",
  definitionLabel: "项目节点提醒",
  revision: 2,
  action: "published" as const,
  actorUserId: 7,
  actorUsername: "operator",
  occurredAt: "2026-07-31T08:00:00.000Z",
  priorVersion: 2,
  newVersion: 3,
};

mock.module("./notification-publishing-storage", {
  exports: {
    RECIPIENTS_PER_SOURCE_PER_MINUTE: 500,
    listNotificationDefinitionManagementRows: async () => [{ key: "custom.project.deadline" }],
    listPublishedNotificationDefinitionConsoleRows: async () => [{ key: "custom.published" }],
    listNotificationPublishingClients: async () => [{ id: 1, name: "Client", status: "active" }],
    listNotificationPublicationSummaries: async () => [{ id: "publication-1" }],
    listNotificationChannelEndpointSummaries: async () => [{ key: "wecom.primary" }],
    listNotificationDefinitionLifecycleEvents: async () => {
      lifecycleReads += 1;
      return [lifecycleEvent];
    },
  },
} as never);

mock.module("./rbac/action-grants", {
  exports: {
    evaluatePermissionAction: async (_userId: number, _resource: string, action: string) => (
      grants[action as keyof typeof grants] ?? false
    ),
  },
} as never);

const { listNotificationPublishingConsoleData } = await import("./notification-publishing-console");

test("notification console returns the secret-free lifecycle audit DTO to auditors", async () => {
  grants = { read: true, configure: true, audit: true };
  lifecycleReads = 0;
  const result = await listNotificationPublishingConsoleData(7);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.lifecycleEvents, [lifecycleEvent]);
  assert.equal(lifecycleReads, 1);
  assert.deepEqual(Object.keys(result.data.lifecycleEvents[0]!).sort(), [
    "action",
    "actorUserId",
    "actorUsername",
    "definitionId",
    "definitionKey",
    "definitionLabel",
    "id",
    "newVersion",
    "occurredAt",
    "priorVersion",
    "revision",
  ]);
});

test("notification console does not read or expose lifecycle events without audit permission", async () => {
  grants = { read: true, configure: false, audit: false };
  lifecycleReads = 0;
  const result = await listNotificationPublishingConsoleData(8);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.lifecycleEvents, []);
  assert.equal(lifecycleReads, 0);
});
