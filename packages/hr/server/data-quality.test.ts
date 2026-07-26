import assert from "node:assert/strict";
import test from "node:test";

import { evaluateHrDataQualityRows } from "./data-quality";

function employee(overrides: Partial<Parameters<typeof evaluateHrDataQualityRows>[0][number]> = {}) {
  return {
    id: 1,
    employeeId: "EMP-X001",
    name: "测试员工",
    activeEmploymentCount: 1,
    currentAssignments: [{
      reportingCompanyId: 1,
      departmentId: 1,
      positionId: 1,
      isPrimary: true,
      workPercent: "1",
    }],
    ...overrides,
  };
}

test("healthy active employee produces no HR data-quality finding", () => {
  assert.deepEqual(evaluateHrDataQualityRows([employee()]), []);
});

test("HR data-quality rules aggregate affected employees by stable check fingerprint", () => {
  const findings = evaluateHrDataQualityRows([employee({
    activeEmploymentCount: 2,
    currentAssignments: [{
      reportingCompanyId: null,
      departmentId: null,
      positionId: null,
      isPrimary: false,
      workPercent: "0.5",
    }],
  })]);
  assert.deepEqual(findings.map((finding) => finding.checkKey), [
    "hr.active-employment.unique",
    "hr.active-employee.current-assignment",
    "hr.current-assignment.organization-complete",
    "hr.current-assignment.workload-total",
  ]);
  assert.ok(findings.every((finding) => finding.count === 1));
  assert.ok(findings.every((finding) => finding.fingerprint.endsWith(":global")));
});
