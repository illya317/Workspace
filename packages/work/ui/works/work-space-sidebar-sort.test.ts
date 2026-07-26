import assert from "node:assert/strict";
import test from "node:test";
import { compareAnnualPlans } from "./work-plan-navigation-order";
import type { WorkPeriodType, WorkPlan } from "./types";

test("annual plan navigation sorts newer years before older years", () => {
  const plans = [
    plan(1, "2026年度计划", "yearly", "2026-01-01", "2026-12-31"),
    plan(2, "2027年上半年计划", "half_year", "2027-01-01", "2027-06-30"),
    plan(3, "2026年下半年计划", "half_year", "2026-07-01", "2026-12-31"),
    plan(4, "2027年度计划", "yearly", "2027-01-01", "2027-12-31"),
    plan(5, "2026年上半年计划", "half_year", "2026-01-01", "2026-06-30"),
    plan(6, "2027年下半年计划", "half_year", "2027-07-01", "2027-12-31"),
  ].sort(compareAnnualPlans);

  assert.deepEqual(plans.map((item) => item.title), [
    "2027年下半年计划",
    "2027年上半年计划",
    "2027年度计划",
    "2026年下半年计划",
    "2026年上半年计划",
    "2026年度计划",
  ]);
});

function plan(id: number, title: string, periodType: WorkPeriodType, plannedStartDate: string, plannedEndDate: string) {
  return { id, title, kind: "okr", periodType, plannedStartDate, plannedEndDate } as WorkPlan;
}
