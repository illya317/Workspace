import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmployeeAssignmentCreateCommand,
  buildEmploymentPeriodCreateCommand,
} from "./employee-period-create-validation";

test("Employment creation accepts business fields without lifecycle metadata", () => {
  const result = buildEmploymentPeriodCreateCommand({
    employeeId: 7,
    userId: 5,
    joinDate: "2026-07-01",
    leaveNote: "补录",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.joinDate, "2026-07-01");
  assert.equal(result.data.leaveDate, null);
});

test("assignment creation normalizes numeric identifiers and relative weight", () => {
  const result = buildEmployeeAssignmentCreateCommand(7, {
    reportingCompanyId: "1",
    departmentId: "2",
    positionId: "3",
    isPrimary: true,
    startDate: "2026-07-01",
    allocationWeight: 70,
  }, 5);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.reportingCompanyId, 1);
  assert.equal(result.data.allocationWeight, "70");
});

test("assignment creation rejects missing dates instead of planner metadata", () => {
  const result = buildEmployeeAssignmentCreateCommand(7, {
    reportingCompanyId: 1,
    departmentId: 2,
    positionId: 3,
    isPrimary: true,
    allocationWeight: 30,
  }, 5);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.issue.message, /开始日期/);
});
