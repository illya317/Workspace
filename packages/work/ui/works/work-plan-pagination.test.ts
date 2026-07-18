import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WORK_PLAN_PAGE_SIZE,
  normalizeWorkPlanPageIndex,
  normalizeWorkPlanPageSize,
  WORK_PLAN_PAGE_SIZE_OPTIONS,
} from "./work-plan-pagination";

test("work plan page size accepts only declared choices", () => {
  for (const option of WORK_PLAN_PAGE_SIZE_OPTIONS) assert.equal(normalizeWorkPlanPageSize(option), option);
  assert.equal(normalizeWorkPlanPageSize("0.1"), DEFAULT_WORK_PLAN_PAGE_SIZE);
  assert.equal(normalizeWorkPlanPageSize(""), DEFAULT_WORK_PLAN_PAGE_SIZE);
  assert.equal(normalizeWorkPlanPageSize("other"), DEFAULT_WORK_PLAN_PAGE_SIZE);
});

test("work plan page index remains inside the available range", () => {
  assert.equal(normalizeWorkPlanPageIndex(-1, 3), 0);
  assert.equal(normalizeWorkPlanPageIndex(2.8, 3), 2);
  assert.equal(normalizeWorkPlanPageIndex(20, 3), 2);
  assert.equal(normalizeWorkPlanPageIndex(Number.NaN, 0), 0);
});
