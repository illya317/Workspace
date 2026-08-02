import assert from "node:assert/strict";
import test from "node:test";

import {
  notificationGroupDataScopeSchema,
  notificationGroupPolicyCreateSchema,
  notificationGroupScheduleSchema,
  splitWeeklyReportNotificationContent,
  toGroupPublicationReceipt,
  weeklyReportMessageTemplateSchema,
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

test("weekly Agent policies require an editable, governed message template", () => {
  const base = {
    key: "work.weekly-report.friday-1030",
    groupKey: "wecom.group.example",
    definitionKey: "custom.work.weekly-report-reminder",
    label: "周报提醒",
    dataScope: { type: "workspace" as const, ids: [], label: "全 Workspace" },
    schedule: { mode: "weekly" as const, timezone: "Asia/Shanghai" as const, weekday: 5, time: "10:30" },
    weeklyAgentKey: "work.weekly-report" as const,
    enabled: false,
  };
  assert.equal(notificationGroupPolicyCreateSchema.safeParse(base).success, false);
  assert.equal(notificationGroupPolicyCreateSchema.safeParse({
    ...base,
    messageTemplate: "工作汇报提醒\n\n{{salutation}}\n\n{{meeting_date}}召开{{meeting_type}}。",
  }).success, true);
  assert.equal(weeklyReportMessageTemplateSchema.safeParse("{{unknown_value}}").success, false);
  assert.deepEqual(splitWeeklyReportNotificationContent("工作汇报提醒\n\n正文第一行\n正文第二行"), {
    title: "工作汇报提醒",
    body: "正文第一行\n正文第二行",
  });
});
