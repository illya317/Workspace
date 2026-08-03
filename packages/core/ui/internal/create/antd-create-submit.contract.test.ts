import assert from "node:assert/strict";
import test from "node:test";

import {
  executeCreateSubmissionOnce,
  isCreateSubmissionDisabled,
  resolveCreateSubmissionMessage,
  type CreateSubmissionLock,
} from "./antd-create-submit";

test("disabled is the OR of capability, surface and submission constraints", () => {
  assert.equal(isCreateSubmissionDisabled({}), false);
  assert.equal(isCreateSubmissionDisabled({ canCreate: false }), true);
  assert.equal(isCreateSubmissionDisabled({ surfaceDisabled: true, submissionDisabled: false }), true);
  assert.equal(isCreateSubmissionDisabled({ surfaceDisabled: false, submissionDisabled: true }), true);
});

test("synchronous lock skips a same-tick second submission", async () => {
  const lock: CreateSubmissionLock = { current: false };
  let executeCount = 0;
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const options = {
    lock,
    disabled: false,
    execute: () => {
      executeCount += 1;
      return pending;
    },
    onPendingChange: () => undefined,
    onSuccess: () => undefined,
    onError: () => undefined,
  };

  const first = executeCreateSubmissionOnce(options);
  const second = await executeCreateSubmissionOnce(options);
  assert.equal(second, "skipped");
  assert.equal(executeCount, 1);
  release?.();
  assert.equal(await first, "executed");
});

test("success and failure callbacks each run exactly once on their own path", async () => {
  const successLock: CreateSubmissionLock = { current: false };
  const pendingStates: boolean[] = [];
  let successCount = 0;
  let errorCount = 0;
  await executeCreateSubmissionOnce({
    lock: successLock,
    disabled: false,
    execute: () => ({ outcome: "saved", message: "完成" }),
    onPendingChange: (pending) => pendingStates.push(pending),
    onSuccess: () => { successCount += 1; },
    onError: () => { errorCount += 1; },
  });
  assert.deepEqual(pendingStates, [true, false]);
  assert.equal(successCount, 1);
  assert.equal(errorCount, 0);

  const errorLock: CreateSubmissionLock = { current: false };
  await executeCreateSubmissionOnce({
    lock: errorLock,
    disabled: false,
    execute: () => { throw new Error("失败"); },
    onPendingChange: () => undefined,
    onSuccess: () => { successCount += 1; },
    onError: () => { errorCount += 1; },
  });
  assert.equal(successCount, 1);
  assert.equal(errorCount, 1);
});

test("message precedence is result, feedback, then action default", () => {
  assert.equal(resolveCreateSubmissionMessage({
    action: "save",
    feedback: { saved: "已新增" },
    result: { outcome: "submitted", message: "服务端已受理" },
    title: "凭证",
  }), "服务端已受理");
  assert.equal(resolveCreateSubmissionMessage({
    action: "save",
    feedback: { submitted: "已进入流程" },
    result: { outcome: "submitted" },
    title: "凭证",
  }), "已进入流程");
  assert.equal(resolveCreateSubmissionMessage({
    action: "submit",
    result: undefined,
    title: "凭证",
  }), "凭证流程已提交");
});
