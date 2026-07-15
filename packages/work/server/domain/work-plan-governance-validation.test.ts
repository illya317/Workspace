import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalPayloadReferencesWorkPlan,
  validateWorkOkrSettingsMutation,
  validateWorkPlanGovernanceMigrationCommand,
} from "./work-plan-governance-validation";

test("OKR settings mutation keeps ordinary settings on the control branch", () => {
  const input = { settings: { enabled: true }, actorUserId: 7 };
  const result = validateWorkOkrSettingsMutation(input);
  assert.deepEqual(result, { ok: true, data: { kind: "control_settings", input } });
});

test("governance migration normalizes unique plan ids and reason", () => {
  const result = validateWorkOkrSettingsMutation({
    actorUserId: 7,
    governanceMigration: { planIds: [3, "3", 5], reason: "  switch policy  " },
  });
  assert.deepEqual(result, {
    ok: true,
    data: {
      kind: "governance_migration",
      migration: { planIds: [3, 5], actorUserId: 7, reason: "switch policy" },
    },
  });
});

test("governance migration cannot be mixed with time settings", () => {
  const result = validateWorkOkrSettingsMutation({
    actorUserId: 7,
    settings: {},
    governanceMigration: { planIds: [3], reason: "switch policy" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.message, "治理规则迁移不能和 OKR 时间设置同时提交");
});

test("governance migration rejects invalid ids instead of silently dropping them", () => {
  const result = validateWorkPlanGovernanceMigrationCommand({
    actorUserId: 7,
    planIds: [3, 0],
    reason: "switch policy",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.message, "OKR 计划 ID 无效");
});

test("governance migration requires an authenticated actor and a reason", () => {
  const actor = validateWorkPlanGovernanceMigrationCommand({ planIds: [3], reason: "switch policy" });
  assert.equal(actor.ok, false);
  if (!actor.ok) assert.equal(actor.issue.status, 401);
  const reason = validateWorkPlanGovernanceMigrationCommand({ actorUserId: 7, planIds: [3], reason: " " });
  assert.equal(reason.ok, false);
  if (!reason.ok) assert.equal(reason.issue.message, "治理规则迁移原因不能为空");
});

test("in-flight governance checks recognize report item workPlanId references", () => {
  assert.equal(approvalPayloadReferencesWorkPlan(JSON.stringify({
    items: [{ workPlanId: 17 }],
  }), 17), true);
  assert.equal(approvalPayloadReferencesWorkPlan(JSON.stringify({ planId: 19 }), 19), true);
  assert.equal(approvalPayloadReferencesWorkPlan('{"workPlanId":23', 23), true);
  assert.equal(approvalPayloadReferencesWorkPlan(JSON.stringify({ workPlanId: 23 }), 24), false);
});
