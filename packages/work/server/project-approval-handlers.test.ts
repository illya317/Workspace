import assert from "node:assert/strict";
import test from "node:test";
import { remainingProjectConfirmationHandlers } from "./project-approval-handlers";

test("deduplicates responsible users shared by multiple enabling departments", () => {
  assert.deepEqual(remainingProjectConfirmationHandlers([7, 9, 7, 9], 3), [7, 9]);
});

test("treats submission as the submitter owner confirmation when other owners remain", () => {
  assert.deepEqual(remainingProjectConfirmationHandlers([3, 7, 9], 3), [7, 9]);
});

test("keeps a sole submitter owner so the shared workflow can auto-confirm", () => {
  assert.deepEqual(remainingProjectConfirmationHandlers([3], 3), [3]);
});
