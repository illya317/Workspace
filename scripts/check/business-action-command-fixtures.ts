import assert from "node:assert/strict";

import { serviceError, serviceOk } from "../../packages/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeApprovedBusinessActionCommand,
  executeBusinessActionCommand,
  executeDirectBusinessActionCommand,
} from "../../packages/platform/server/business-action-executor";
import type { ApprovalAdapter } from "../../packages/platform/server/approvals";
import { buildContractDeleteCommand } from "../../packages/administration/server/domain/administration-contract-validation";

const CREATE_VALIDATOR = "packages/administration/server/domain/administration-contract-validation.buildContractCreateCommand";
const CREATE_COMMIT = "packages/administration/server/contracts.commitCreateContractCommand";

async function main() {
  let validateCount = 0;
  let commitCount = 0;
  const command = defineBusinessActionCommandAdapter({
    businessActionKey: "administration.contract.create",
    validatorKey: CREATE_VALIDATOR,
    commitKey: CREATE_COMMIT,
    validate: (input: { name: string }) => {
      validateCount += 1;
      return input.name ? serviceOk({ name: input.name.trim() }) : serviceError("合同名称必填", 400);
    },
    commit: (input: { name: string }) => {
      commitCount += 1;
      return serviceOk({ id: 1, name: input.name });
    },
  });

  const invalid = await executeDirectBusinessActionCommand({
    command,
    input: { name: "" },
    context: undefined,
    actorUserId: 1,
  });
  assert.equal(invalid.ok, false);
  assert.equal(validateCount, 1);
  assert.equal(commitCount, 0);

  const forbidden = await executeDirectBusinessActionCommand({
    command,
    input: { name: "  合同 A  " },
    context: undefined,
    actorUserId: 1,
    authorize: () => false,
  });
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) assert.equal(forbidden.status, 403);
  assert.equal(validateCount, 2);
  assert.equal(commitCount, 0);

  const success = await executeDirectBusinessActionCommand({
    command,
    input: { name: "  合同 A  " },
    context: undefined,
    actorUserId: 1,
  });
  assert.deepEqual(success, { ok: true, data: { id: 1, name: "合同 A" } });
  assert.equal(validateCount, 3);
  assert.equal(commitCount, 1);

  const conflict = await executeDirectBusinessActionCommand({
    command: { ...command, commit: () => serviceError("版本冲突", 409) },
    input: { name: "合同 A" },
    context: undefined,
    actorUserId: 1,
  });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.status, 409, "optimistic conflicts must cross the public command seam unchanged");

  const mismatched = await executeDirectBusinessActionCommand({
    command: { ...command, commitKey: "wrong.commit" },
    input: { name: "合同 B" },
    context: undefined,
    actorUserId: 1,
  });
  assert.equal(mismatched.ok, false);
  if (!mismatched.ok) assert.equal(mismatched.status, 500);
  assert.equal(validateCount, 4, "binding mismatch must fail before validation");
  assert.equal(commitCount, 1);

  const invalidVersion = buildContractDeleteCommand(1, 1, -1);
  assert.equal(invalidVersion.ok, false);
  const validVersion = buildContractDeleteCommand(1, 1, 0);
  assert.equal(validVersion.ok, true);

  let approvedValidationCount = 0;
  let approvedCommitCount = 0;
  const approvedCommand = defineBusinessActionCommandAdapter({
    businessActionKey: "hr.roster.department.create",
    validatorKey: "packages/hr/server/domain/department-validation.buildDepartmentCreateCommand",
    commitKey: "packages/hr/server/departments.commitDepartmentCreateCommand",
    validate: (input: { code: string }) => {
      approvedValidationCount += 1;
      return serviceOk({ code: input.code.trim() });
    },
    commit: (input: { code: string }) => {
      approvedCommitCount += 1;
      return serviceOk({ id: 9, code: input.code });
    },
  });
  const approved = await executeApprovedBusinessActionCommand({
    command: approvedCommand,
    input: { code: "  OPS  " },
    context: undefined,
  });
  assert.deepEqual(approved, { ok: true, data: { id: 9, code: "OPS" } });
  assert.equal(approvedValidationCount, 1);
  assert.equal(approvedCommitCount, 1);

  const explicitlyDirect = await executeBusinessActionCommand({
    command: approvedCommand,
    input: { code: "  FIN  " },
    context: undefined,
    actorUserId: 1,
    workflow: {
      applicable: false,
      adapter: {} as ApprovalAdapter<{ code: string }>,
      operation: "create",
      prepare: () => { throw new Error("inapplicable workflow preparation must not run"); },
    },
  });
  assert.equal(explicitlyDirect.ok, true, "an explicitly inapplicable workflow must stay on the direct command path");
  if (explicitlyDirect.ok) assert.equal(explicitlyDirect.data.executionMode, "direct");

  process.stdout.write("Business action command fixtures passed.\n");
}

void main();
