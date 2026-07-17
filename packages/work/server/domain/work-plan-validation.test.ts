import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkPlanCycleBinding } from "./work-plan-validation";

test("user-created extra OKR plans stay outside fixed cycles", () => {
  assert.deepEqual(validateWorkPlanCycleBinding({ kind: "okr", isSystemGenerated: false }), {
    ok: true,
    data: true,
  });
  const result = validateWorkPlanCycleBinding({
    kind: "okr",
    isSystemGenerated: false,
    periodType: "monthly",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.message, "额外 OKR 计划不属于固定周期");
});

test("system-generated OKR plans require a concrete cycle", () => {
  const missing = validateWorkPlanCycleBinding({ kind: "okr", isSystemGenerated: true });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.issue.message, "系统固定周期计划必须选择 OKR 周期");
  assert.deepEqual(validateWorkPlanCycleBinding({
    kind: "okr",
    isSystemGenerated: true,
    okrCycleId: 17,
    periodType: "monthly",
  }), { ok: true, data: true });
});

test("routine containers do not use the OKR cycle contract", () => {
  assert.deepEqual(validateWorkPlanCycleBinding({
    kind: "routine",
    isSystemGenerated: false,
    periodType: "monthly",
  }), { ok: true, data: true });
});
