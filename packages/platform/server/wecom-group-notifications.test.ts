import assert from "node:assert/strict";
import test from "node:test";

import {
  notificationGroupDataScopeSchema,
  notificationGroupScheduleSchema,
  toGroupPublicationReceipt,
} from "./wecom-group-notifications";

test("group publication receipt keeps policy id separate from publication id", () => {
  const createdAt = new Date("2026-07-31T00:00:00.000Z");
  assert.deepEqual(toGroupPublicationReceipt({
    id: "publication-1",
    definitionKey: "custom.weekly_report",
    definitionRevision: 3,
    status: "processing",
    createdAt,
  }, "7b51f0c0-8122-4d41-890d-0f404d603a68", false), {
    publicationId: "publication-1",
    policyId: "7b51f0c0-8122-4d41-890d-0f404d603a68",
    definitionKey: "custom.weekly_report",
    revision: 3,
    status: "processing",
    replayed: false,
    createdAt: createdAt.toISOString(),
  });
});

test("group data scope is bounded and workspace scope rejects ids", () => {
  assert.equal(notificationGroupDataScopeSchema.safeParse({
    type: "workspace",
    ids: ["12"],
    label: "全 Workspace",
  }).success, false);
  assert.equal(notificationGroupDataScopeSchema.safeParse({
    type: "projects",
    ids: ["12"],
    label: "重点项目",
  }).success, true);
});

test("weekly schedules require the governed timezone", () => {
  assert.equal(notificationGroupScheduleSchema.safeParse({
    mode: "weekly",
    timezone: "Asia/Shanghai",
    weekday: 5,
    time: "17:30",
  }).success, true);
  assert.equal(notificationGroupScheduleSchema.safeParse({
    mode: "weekly",
    timezone: "UTC",
    weekday: 5,
    time: "17:30",
  }).success, false);
});
