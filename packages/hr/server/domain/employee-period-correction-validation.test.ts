import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmployeePeriodCorrectionCommand,
  employeePeriodCorrectionHasChanges,
  validateAssignmentCorrectionTimeline,
  type AssignmentState,
} from "./employee-period-correction-validation";

function assignment(overrides: Partial<AssignmentState> = {}): AssignmentState {
  return {
    id: 1,
    employeeId: 7,
    version: 1,
    reportingCompanyId: 1,
    departmentId: 1,
    positionId: 1,
    positionReportOverrideId: null,
    isPrimary: true,
    startDate: "2025-01-01",
    endDate: null,
    reportTo: null,
    reportToPositionId: null,
    allocationWeight: "100",
    ...overrides,
  };
}

test("ordinary Employment correction accepts a narrow patch without a reason", () => {
  const result = buildEmployeePeriodCorrectionCommand(7, 11, {
    entityType: "Employment",
    expectedVersion: 3,
    patch: { joinDate: "2026-07-01", leaveNote: "补录说明" },
  }, 5);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.patch, { joinDate: "2026-07-01", leaveNote: "补录说明" });
  assert.equal(result.data.reason, null);
});

test("correction rejects full-record and lifecycle metadata leakage", () => {
  const result = buildEmployeePeriodCorrectionCommand(7, 11, {
    entityType: "EDP",
    expectedVersion: 3,
    patch: { startDate: "2026-07-01", effectiveOn: "2026-07-01" },
  }, 5);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.issue.message, /effectiveOn/);
});

test("same values are a real no-op", () => {
  assert.equal(employeePeriodCorrectionHasChanges(
    { startDate: "2026-07-01", isPrimary: true },
    { startDate: "2026-07-01", isPrimary: true },
  ), false);
  assert.equal(employeePeriodCorrectionHasChanges(
    { startDate: "2026-07-01", isPrimary: true },
    { isPrimary: false },
  ), true);
});

test("moving a primary assignment start forward validates the removed historical slice", () => {
  const current = assignment();
  const next = assignment({ startDate: "2026-01-01" });
  const secondary = assignment({ id: 2, isPrimary: false, allocationWeight: "40" });
  const error = validateAssignmentCorrectionTimeline([next, secondary], current, next);
  assert.match(error ?? "", /必须且只能有一个主岗/);
});
