import assert from "node:assert/strict";
import test from "node:test";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

import {
  buildEmploymentCreateCommand,
  buildEmploymentFieldUpdateCommand,
  validateEmploymentPersonnelTypeTransition,
  validateOrdinaryEmploymentTarget,
  VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR,
} from "./employment-validation";

test("ordinary HR employment creation cannot create a virtual employee identity", async () => {
  const virtualPersonnelType = getTenantProfile().hr.options.virtualEmployeePersonnelType;
  const result = await buildEmploymentCreateCommand({ employeeId: 1, personnelType: virtualPersonnelType });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.message, VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR);
});

test("ordinary HR employment creation rejects an Agent-linked employee", () => {
  const result = validateOrdinaryEmploymentTarget("synthetic.agent.profile");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.message, VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR);
  assert.equal(validateOrdinaryEmploymentTarget(null).ok, true);
});

test("ordinary HR employment edits cannot enter or leave the virtual employee identity", async () => {
  const virtualPersonnelType = getTenantProfile().hr.options.virtualEmployeePersonnelType;
  const enter = await buildEmploymentFieldUpdateCommand("personnelType", virtualPersonnelType);
  assert.equal(enter.ok, false);

  const leave = validateEmploymentPersonnelTypeTransition(virtualPersonnelType, "ordinary-personnel-type");
  assert.equal(leave.ok, false);
  if (!leave.ok) assert.equal(leave.issue.message, VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR);
});

test("ordinary personnel type transitions remain valid", () => {
  const result = validateEmploymentPersonnelTypeTransition("ordinary-a", "ordinary-b");
  assert.deepEqual(result, { ok: true, data: { value: "ordinary-b" } });
});
