import assert from "node:assert/strict";
import test from "node:test";

import { WEEKLY_REPORT_DEFAULT_MESSAGE_TEMPLATE } from "@workspace/platform/server/wecom-group-notification-scheduler-api";
import {
  renderWeeklyReportMessageTemplate,
  resolveWeeklyReportNotificationSlot,
} from "./weekly-report-group-notifications";

const messageTemplate = WEEKLY_REPORT_DEFAULT_MESSAGE_TEMPLATE;

const policy = {
  messageTemplate,
  schedule: {
    mode: "weekly" as const,
    timezone: "Asia/Shanghai" as const,
    weekday: 5,
    time: "10:30",
  },
};

test("weekly report slot waits for the governed Shanghai schedule", () => {
  assert.equal(
    resolveWeeklyReportNotificationSlot(new Date("2026-07-31T02:29:00.000Z"), policy, { followUp: false }),
    null,
  );
  assert.equal(
    resolveWeeklyReportNotificationSlot(new Date("2026-07-30T03:00:00.000Z"), policy, { followUp: false }),
    null,
  );
});

test("the last Friday uses the legacy monthly-report wording and a durable slot key", () => {
  const slot = resolveWeeklyReportNotificationSlot(
    new Date("2026-07-31T02:30:00.000Z"),
    policy,
    { followUp: false },
  );
  assert.ok(slot);
  assert.equal(slot.dateKey, "2026-07-31");
  assert.equal(slot.idempotencyKey, "weekly-report:2026-07-31:1030");
  assert.match(slot.message, /^工作汇报提醒\n\n/);
  assert.match(slot.message, /8月3日（星期一）召开月度例会/);
  assert.match(slot.message, /7月1日—7月31日/);
  assert.match(slot.message, /工作汇报 → 月报/);
  assert.doesNotMatch(slot.message, /再次提醒/);
});

test("later policies produce the follow-up wording while ordinary Fridays remain weekly", () => {
  const slot = resolveWeeklyReportNotificationSlot(
    new Date("2026-07-24T07:31:00.000Z"),
    { messageTemplate, schedule: { ...policy.schedule, time: "15:30" } },
    { followUp: true },
  );
  assert.ok(slot);
  assert.match(slot.message, /再次提醒/);
  assert.match(slot.message, /下周一（7月27日）召开周例会/);
  assert.match(slot.message, /7月20日—7月24日/);
  assert.match(slot.message, /工作汇报 → 周报/);
});

test("the policy-owned original is rendered unchanged except for controlled variables", () => {
  const slot = resolveWeeklyReportNotificationSlot(
    new Date("2026-07-24T02:30:00.000Z"),
    { ...policy, messageTemplate: "自定义提醒：{{meeting_date}}，请填写{{report_tab}}。" },
    { followUp: false },
  );
  assert.equal(slot?.message, "自定义提醒：下周一（7月27日），请填写周报。");
  assert.throws(
    () => renderWeeklyReportMessageTemplate("{{unknown}}", {}),
    /unsupported/,
  );
});
