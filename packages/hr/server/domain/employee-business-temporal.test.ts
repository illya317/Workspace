import assert from "node:assert/strict";
import test from "node:test";

import {
  assignmentPeriodContainsDate,
  assignmentTemporalPosition,
  classifyEmploymentsByPreference,
  employmentPeriodContainsDate,
  employmentSummaryState,
  employmentTemporalPosition,
  HR_EMPLOYEE_TEMPORAL_CATALOG,
} from "./employee-business-temporal";

test("HR registers only period-backed employee aggregates", () => {
  assert.deepEqual(HR_EMPLOYEE_TEMPORAL_CATALOG.keys(), [
    "hr.employee.assignment",
    "hr.employee.employment",
  ]);
  assert.equal(
    HR_EMPLOYEE_TEMPORAL_CATALOG.require("hr.employee.assignment").policy.storage,
    "effective-version",
  );
});

test("assignment periods classify future rows as upcoming rather than history", () => {
  const assignment = { startDate: "2026-08-01", endDate: "2026-08-31" };
  assert.equal(assignmentTemporalPosition(assignment, "2026-07-31"), "upcoming");
  assert.equal(assignmentTemporalPosition(assignment, "2026-08-01"), "current");
  assert.equal(assignmentTemporalPosition(assignment, "2026-08-31"), "current");
  assert.equal(assignmentTemporalPosition(assignment, "2026-09-01"), "past");
  assert.equal(assignmentPeriodContainsDate(assignment, "2026-08-31"), true);
});

test("employment dates outrank stale isActive while undated legacy rows fall back to it", () => {
  assert.equal(employmentTemporalPosition({
    isActive: true,
    joinDate: "2026-08-01",
    leaveDate: null,
  }, "2026-07-26"), "upcoming");
  assert.equal(employmentTemporalPosition({
    isActive: false,
    joinDate: "2026-01-01",
    leaveDate: "2026-08-01",
  }, "2026-07-26"), "current");
  assert.equal(employmentPeriodContainsDate({
    isActive: false,
    joinDate: null,
    leaveDate: null,
  }, "2026-07-26"), false);
  assert.equal(employmentTemporalPosition({
    isActive: true,
    joinDate: "invalid",
    leaveDate: null,
  }, "2026-07-26"), "invalid");
});

test("employment preference selects current, nearest upcoming, then recent past", () => {
  const employments = [
    { id: 1, isActive: true, joinDate: "2025-01-01", leaveDate: "2026-07-01" },
    { id: 2, isActive: false, joinDate: "2026-09-01", leaveDate: null },
    { id: 3, isActive: false, joinDate: "2026-08-01", leaveDate: null },
  ];

  assert.deepEqual(
    classifyEmploymentsByPreference(employments, "2026-07-27").map(({ employment }) => employment.id),
    [3, 2, 1],
  );
});

test("invalid employment dates remain visible in the profile summary", () => {
  assert.equal(employmentSummaryState(["past", "invalid"]), "invalid");
  assert.equal(employmentSummaryState(["current"]), "active");
  assert.equal(employmentSummaryState(["upcoming", "past"]), "upcoming");
  assert.equal(employmentSummaryState(["past"]), "inactive");
});
