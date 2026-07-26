import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyWorkPlanDraft, isPlanDraftComplete, workPlanDraftPayload } from "./model";
import { planMatchesPeriodFilter } from "./work-plan-period-filter";
import type { WorkPlan } from "./types";

test("cycleless extra OKR plans belong to the daily filter", () => {
  const plan = { kind: "okr", periodType: null } as WorkPlan;
  assert.equal(planMatchesPeriodFilter(plan, "routine"), true);
  assert.equal(planMatchesPeriodFilter(plan, "monthly"), false);
  assert.equal(planMatchesPeriodFilter(plan, "quarterly"), false);
  assert.equal(planMatchesPeriodFilter(plan, "yearly"), false);
});

test("the all filter keeps monthly and quarterly plans in navigation", () => {
  assert.equal(planMatchesPeriodFilter({ kind: "okr", periodType: "monthly" } as WorkPlan, "all"), true);
  assert.equal(planMatchesPeriodFilter({ kind: "okr", periodType: "quarterly" } as WorkPlan, "all"), true);
});

test("extra OKR plan payloads clear fixed-cycle fields", () => {
  const draft = createEmptyWorkPlanDraft();
  draft.okrCycleId = 17;
  draft.periodType = "monthly";
  draft.alignmentSourceType = "plan";
  draft.alignmentSourcePlanId = 23;
  draft.previousPeriodPlanId = 11;

  const payload = workPlanDraftPayload(draft);
  assert.equal(payload.okrCycleId, null);
  assert.equal(payload.periodType, null);
  assert.equal(payload.alignmentSourceType, null);
  assert.equal(payload.alignmentSourcePlanId, null);
  assert.equal(payload.parentPeriodPlanId, null);
  assert.equal(payload.previousPeriodPlanId, null);
});

test("cycleless extra OKR plans can be saved without a period", () => {
  const draft = {
    kind: "okr" as const,
    title: "临时专项 OKR",
    isSystemGenerated: false,
    okrCycleId: null,
    periodType: null,
    plannedStartDate: "2026-08-01",
    plannedEndDate: "2026-08-31",
    ownerEmployeeId: 7,
  };

  assert.equal(isPlanDraftComplete(draft), true);
  assert.equal(isPlanDraftComplete({ ...draft, isSystemGenerated: true }), false);
  assert.equal(isPlanDraftComplete({ ...draft, isSystemGenerated: true, okrCycleId: 17, periodType: "monthly" }), true);
});
