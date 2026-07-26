import assert from "node:assert/strict";
import test from "node:test";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

import {
  buildEmploymentFieldUpdateCommand,
  buildEmploymentPageDraftCommand,
  validateEmploymentPersonnelTypeTransition,
  VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR,
} from "./employment-validation";

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

test("ordinary employment edits reject lifecycle boundary fields", async () => {
  for (const field of ["isActive", "joinDate", "leaveDate"]) {
    const result = await buildEmploymentFieldUpdateCommand(field, null);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issue.status, 409);
      assert.equal(result.issue.field, field);
      assert.match(result.issue.message, /生命周期/);
    }
  }
});

test("employment page drafts accept non-period profile corrections", async () => {
  const result = await buildEmploymentPageDraftCommand({
    userId: 9,
    changes: [{ id: 12, field: "rank", value: null }],
  });
  assert.deepEqual(result, {
    ok: true,
    data: {
      userId: 9,
      changes: [{ id: 12, field: "rank", value: null }],
    },
  });
});
