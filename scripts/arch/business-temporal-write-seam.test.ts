import assert from "node:assert/strict";
import test from "node:test";
import { findBusinessTemporalWriteViolations, type BusinessTemporalWriteRule } from "./business-temporal-write-seam";

const rule: BusinessTemporalWriteRule = {
  delegate: "employeeProject",
  model: "EmployeeProject",
  allowedFiles: ["packages/work/server/lifecycle.ts"],
};

test("write seam permits the owner command adapter and reports CRUD bypasses", () => {
  const violations = findBusinessTemporalWriteViolations(new Map([
    ["packages/work/server/lifecycle.ts", "await tx.employeeProject.create({ data });"],
    ["packages/work/server/crud.ts", "await prisma.employeeProject.update({ where, data });\nawait tx.employeeProject.deleteMany({ where });"],
    ["packages/work/server/read.ts", "await prisma.employeeProject.findMany({ where });"],
  ]), [rule]);
  assert.deepEqual(violations, [{
    model: "EmployeeProject",
    file: "packages/work/server/crud.ts",
    line: 1,
    method: "update",
  }, {
    model: "EmployeeProject",
    file: "packages/work/server/crud.ts",
    line: 2,
    method: "deleteMany",
  }]);
});

test("write seam can retire a legacy dual-truth delegate completely", () => {
  const violations = findBusinessTemporalWriteViolations(new Map([
    ["packages/hr/server/departments.ts", "await tx.departmentManagerEmployee.createMany({ data });"],
    ["scripts/check/preflight.ts", "await prisma.departmentManagerEmployee.findMany();"],
  ]), [{
    delegate: "departmentManagerEmployee",
    model: "DepartmentManagerEmployee",
    allowedFiles: [],
  }]);
  assert.deepEqual(violations, [{
    model: "DepartmentManagerEmployee",
    file: "packages/hr/server/departments.ts",
    line: 1,
    method: "createMany",
  }]);
});
