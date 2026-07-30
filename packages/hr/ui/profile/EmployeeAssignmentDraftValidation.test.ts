import assert from "node:assert/strict";
import test from "node:test";

import type { EdpRow } from "@workspace/hr/types";
import { persistableEdpRows, validateCurrentAssignments } from "./EmployeeAssignmentDraftValidation";

function assignment(overrides: Partial<EdpRow> = {}): EdpRow {
  return {
    version: 1,
    employeeId: 1,
    reportingCompanyId: 1,
    reportingCompanyName: "公司",
    departmentId: 10,
    departmentName: "部门",
    departmentPath: "部门",
    positionId: 20,
    positionReportOverrideId: null,
    positionName: "岗位",
    isPrimary: true,
    startDate: "2026-01-01",
    endDate: null,
    reportTo: null,
    reportToPositionId: null,
    allocationWeight: "7",
    allocationPercent: 0.7,
    temporalState: "current",
    ...overrides,
  };
}

test("assignment draft accepts positive relative weights without requiring a 100 percent total", () => {
  const result = validateCurrentAssignments([
    assignment(),
    assignment({ id: 2, isPrimary: false, allocationWeight: "3", allocationPercent: 0.3 }),
  ]);
  assert.equal(result.ok, true);
});

test("assignment draft requires a positive weight and exactly one primary position", () => {
  assert.equal(validateCurrentAssignments([assignment({ allocationWeight: null })]).ok, false);
  assert.equal(validateCurrentAssignments([assignment({ allocationWeight: "0" })]).ok, false);
  assert.equal(validateCurrentAssignments([assignment({ isPrimary: false })]).ok, false);
});

test("a new row containing only an allocation weight is not discarded as blank", () => {
  const row = assignment({
    id: undefined,
    isNew: true,
    positionId: null,
    departmentId: null,
    startDate: null,
    allocationWeight: "10",
  });
  assert.deepEqual(persistableEdpRows([row]), [row]);
});
