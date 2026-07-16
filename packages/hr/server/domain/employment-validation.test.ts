import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmploymentCreateCommand,
  buildEmploymentFieldUpdateCommand,
  validateEmploymentPersonnelTypeTransition,
  validateOrdinaryEmploymentTarget,
  VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR,
} from "./employment-validation";

test("ordinary HR employment creation cannot create a virtual employee identity", async () => {
  const result = await buildEmploymentCreateCommand({ employeeId: 1, personnelType: "虚拟员工" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.message, VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR);
});

test("ordinary HR employment creation rejects an Agent-linked employee", () => {
  const result = validateOrdinaryEmploymentTarget("development.architecture");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.message, VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR);
  assert.equal(validateOrdinaryEmploymentTarget(null).ok, true);
});

test("ordinary HR employment edits cannot enter or leave the virtual employee identity", async () => {
  const enter = await buildEmploymentFieldUpdateCommand("personnelType", "虚拟员工");
  assert.equal(enter.ok, false);

  const leave = validateEmploymentPersonnelTypeTransition("虚拟员工", "其他");
  assert.equal(leave.ok, false);
  if (!leave.ok) assert.equal(leave.issue.message, VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR);
});

test("ordinary personnel type transitions remain valid", () => {
  const result = validateEmploymentPersonnelTypeTransition("核心人员", "其他");
  assert.deepEqual(result, { ok: true, data: { value: "其他" } });
});
