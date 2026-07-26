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
      departmentName: "测试部门",
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

test("HR data-quality rules retain a global fallback for findings without an accountable department", () => {
  const findings = evaluateHrDataQualityRows([employee({
    activeEmploymentCount: 2,
    currentAssignments: [{
      reportingCompanyId: null,
      departmentId: null,
      departmentName: null,
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

test("HR data-quality rules split findings by accountable department", () => {
  const findings = evaluateHrDataQualityRows([
    employee({ id: 1, employeeId: "EMP-1", name: "甲", activeEmploymentCount: 2 }),
    employee({
      id: 2,
      employeeId: "EMP-2",
      name: "乙",
      activeEmploymentCount: 2,
      currentAssignments: [{
        reportingCompanyId: 1,
        departmentId: 2,
        departmentName: "第二部门",
        positionId: 2,
        isPrimary: true,
        workPercent: "1",
      }],
    }),
  ]).filter((finding) => finding.checkKey === "hr.active-employment.unique");

  assert.deepEqual(findings.map((finding) => ({
    fingerprint: finding.fingerprint,
    departmentId: finding.departmentId,
    count: finding.count,
  })), [
    { fingerprint: "hr.active-employment.unique:department:1", departmentId: 1, count: 1 },
    { fingerprint: "hr.active-employment.unique:department:2", departmentId: 2, count: 1 },
  ]);
});
