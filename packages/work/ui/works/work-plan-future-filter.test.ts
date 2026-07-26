import assert from "node:assert/strict";
import test from "node:test";
import { planMatchesFutureFilter } from "./work-plan-future-filter";
import type { WorkPlan } from "./types";

test("future plan filter defaults can limit plans by calendar horizon", () => {
  const today = "2026-07-23";

  assert.equal(planMatchesFutureFilter(plan("2026-10-23"), "3m", today), true);
  assert.equal(planMatchesFutureFilter(plan("2026-10-24"), "3m", today), false);
  assert.equal(planMatchesFutureFilter(plan("2027-01-01"), "3m", today), false);
  assert.equal(planMatchesFutureFilter(plan("2027-01-01"), "1y", today), true);
  assert.equal(planMatchesFutureFilter(plan("2028-01-01"), "all", today), true);
});

test("future plan filter keeps routine and undated plans visible", () => {
  assert.equal(planMatchesFutureFilter({ kind: "routine", plannedStartDate: null, actualStartDate: null }, "1m", "2026-07-23"), true);
  assert.equal(planMatchesFutureFilter({ kind: "okr", plannedStartDate: null, actualStartDate: null }, "3m", "2026-07-23"), true);
});

function plan(plannedStartDate: string) {
  return { kind: "okr", plannedStartDate, actualStartDate: null } as WorkPlan;
}
