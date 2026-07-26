import assert from "node:assert/strict";
import test from "node:test";

import { buildContractDeleteCommand } from "../../packages/administration/server/domain/administration-contract-validation";
import { serviceError, serviceOk } from "../../packages/platform/server/api";
import type { ApprovalAdapter } from "../../packages/platform/server/approvals";
import {
  defineBusinessActionCommandAdapter,
  executeApprovedBusinessActionCommand,
  executeBusinessActionCommand,
  executeDirectBusinessActionCommand,
} from "../../packages/platform/server/business-action-executor";
import { issueApprovalCommitAuthorization } from "@workspace/platform/server/approval-commit-authorization";

const CREATE_VALIDATOR = "packages/administration/server/domain/administration-contract-validation.buildContractCreateCommand";
const CREATE_COMMIT = "packages/administration/server/contracts.commitCreateContractCommand";

function createContractCommandHarness() {
  const calls = { validate: 0, commit: 0 };
  const command = defineBusinessActionCommandAdapter({
    businessActionKey: "administration.contract.create",
    validatorKey: CREATE_VALIDATOR,
    commitKey: CREATE_COMMIT,
    validate: (input: { name: string }) => {
      calls.validate += 1;
      return input.name ? serviceOk({ name: input.name.trim() }) : serviceError("合同名称必填", 400);
    },
    commit: (input: { name: string }) => {
      calls.commit += 1;
      return serviceOk({ id: 1, name: input.name });
    },
  });
  return { calls, command };
}

function createApprovedDepartmentCommandHarness() {
  const calls = { validate: 0, commit: 0 };
  const command = defineBusinessActionCommandAdapter({
    businessActionKey: "hr.roster.department.create",
    validatorKey: "packages/hr/server/domain/department-validation.buildDepartmentCreateCommand",
    commitKey: "packages/hr/server/departments.commitDepartmentCreateCommand",
    validate: (input: { code: string }) => {
      calls.validate += 1;
      return serviceOk({ code: input.code.trim() });
    },
    commit: (input: { code: string }) => {
      calls.commit += 1;
      return serviceOk({ id: 9, code: input.code });
    },
  });
  return { calls, command };
}

test("direct command validation failure prevents persistence", async () => {
  const { calls, command } = createContractCommandHarness();

  const result = await executeDirectBusinessActionCommand({
    command,
    input: { name: "" },
    context: undefined,
    actorUserId: 1,
  });

  assert.deepEqual(result, { ok: false, error: "合同名称必填", status: 400 });
  assert.deepEqual(calls, { validate: 1, commit: 0 });
});

test("direct command authorization failure prevents persistence", async () => {
  const { calls, command } = createContractCommandHarness();

  const result = await executeDirectBusinessActionCommand({
    command,
    input: { name: "  合同 A  " },
    context: undefined,
    actorUserId: 1,
    authorize: () => false,
  });

  assert.deepEqual(result, { ok: false, error: "无权限执行该操作", status: 403 });
  assert.deepEqual(calls, { validate: 1, commit: 0 });
});

test("direct command persists normalized input", async () => {
  const { calls, command } = createContractCommandHarness();

  const result = await executeDirectBusinessActionCommand({
    command,
    input: { name: "  合同 A  " },
    context: undefined,
    actorUserId: 1,
  });

  assert.deepEqual(result, { ok: true, data: { id: 1, name: "合同 A" } });
  assert.deepEqual(calls, { validate: 1, commit: 1 });
});

test("direct command preserves a persistence conflict", async () => {
  const { calls, command } = createContractCommandHarness();

  const result = await executeDirectBusinessActionCommand({
    command: { ...command, commit: () => serviceError("版本冲突", 409) },
    input: { name: "合同 A" },
    context: undefined,
    actorUserId: 1,
  });

  assert.deepEqual(result, { ok: false, error: "版本冲突", status: 409 });
  assert.deepEqual(calls, { validate: 1, commit: 0 });
});

test("contract binding mismatch fails before validation or persistence", async () => {
  const { calls, command } = createContractCommandHarness();

  const result = await executeDirectBusinessActionCommand({
    command: { ...command, commitKey: "wrong.commit" },
    input: { name: "合同 B" },
    context: undefined,
    actorUserId: 1,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 500);
    assert.match(result.error, /ActionContract/);
  }
  assert.deepEqual(calls, { validate: 0, commit: 0 });
});

test("contract delete command rejects a negative optimistic version", () => {
  const invalid = buildContractDeleteCommand(1, 1, -1);
  assert.equal(invalid.ok, false);

  const valid = buildContractDeleteCommand(1, 1, 0);
  assert.equal(valid.ok, true);
});

test("approved command rejects calls without approval-engine authorization", async () => {
  const { calls, command } = createApprovedDepartmentCommandHarness();

  const result = await executeApprovedBusinessActionCommand({
    command,
    input: { code: "GOV-X" },
    context: undefined,
    approvalAuthorization: undefined as never,
    approvalRequest: { id: 91, version: 4, businessActionKey: command.businessActionKey },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /授权/);
  assert.deepEqual(calls, { validate: 0, commit: 0 });
});

test("approved command consumes one engine authorization before committing active data", async () => {
  const { calls, command } = createApprovedDepartmentCommandHarness();
  const approvalAuthorization = issueApprovalCommitAuthorization({
    requestId: 91,
    requestVersion: 4,
    businessActionKey: command.businessActionKey,
  });

  const result = await executeApprovedBusinessActionCommand({
    command,
    input: { code: "  GOV-X  " },
    context: undefined,
    approvalAuthorization,
    approvalRequest: { id: 91, version: 4, businessActionKey: command.businessActionKey },
  });

  assert.deepEqual(result, { ok: true, data: { id: 9, code: "GOV-X" } });
  assert.deepEqual(calls, { validate: 1, commit: 1 });

  const replayed = await executeApprovedBusinessActionCommand({
    command,
    input: { code: "REPLAY" },
    context: undefined,
    approvalAuthorization,
    approvalRequest: { id: 91, version: 4, businessActionKey: command.businessActionKey },
  });
  assert.equal(replayed.ok, false);
  if (!replayed.ok) assert.match(replayed.error, /无效或已使用/);
  assert.deepEqual(calls, { validate: 1, commit: 1 });
});

test("approved command consumes and rejects an authorization bound to another request version", async () => {
  const { calls, command } = createApprovedDepartmentCommandHarness();
  const approvalAuthorization = issueApprovalCommitAuthorization({
    requestId: 91,
    requestVersion: 4,
    businessActionKey: command.businessActionKey,
  });

  const result = await executeApprovedBusinessActionCommand({
    command,
    input: { code: "GOV-X" },
    context: undefined,
    approvalAuthorization,
    approvalRequest: { id: 91, version: 5, businessActionKey: command.businessActionKey },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /审批请求不匹配/);
  assert.deepEqual(calls, { validate: 0, commit: 0 });
});

test("explicitly inapplicable workflow stays on the direct command path", async () => {
  const { calls, command } = createApprovedDepartmentCommandHarness();
  let prepareCount = 0;

  const result = await executeBusinessActionCommand({
    command,
    input: { code: "  FIN  " },
    context: undefined,
    actorUserId: 1,
    workflow: {
      applicable: false,
      adapter: {} as ApprovalAdapter<{ code: string }>,
      operation: "create",
      prepare: () => {
        prepareCount += 1;
        throw new Error("inapplicable workflow preparation must not run");
      },
    },
  });

  assert.deepEqual(result, {
    ok: true,
    data: { executionMode: "direct", result: { id: 9, code: "FIN" } },
  });
  assert.equal(prepareCount, 0);
  assert.deepEqual(calls, { validate: 1, commit: 1 });
});
