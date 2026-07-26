import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedContractStateTransitions,
  canHardDeleteContractFacts,
  previousBusinessDate,
  validateContractStateTransition,
} from "./contract-lifecycle-policy";

test("contract state transitions fail closed", () => {
  assert.deepEqual(allowedContractStateTransitions("lifecycle", "active"), ["terminated", "expired", "closed"]);
  assert.equal(validateContractStateTransition("signature", "signed", "unsigned").ok, false);
  assert.equal(validateContractStateTransition("performance", "in_progress", "fulfilled").ok, true);
  assert.equal(validateContractStateTransition("performance", "fulfilled", "in_progress").ok, false);
});

test("published or evidenced contracts cannot be hard deleted", () => {
  const draft = {
    lifecycleStatus: "draft",
    isArchived: false,
    currentRevisionId: null,
    approvalSourceKey: null,
    attachmentCount: 0,
    recordCount: 0,
    stateEventCount: 0,
    revisionStates: ["draft"],
  };
  assert.equal(canHardDeleteContractFacts(draft), true);
  assert.equal(canHardDeleteContractFacts({ ...draft, currentRevisionId: 12 }), false);
  assert.equal(canHardDeleteContractFacts({ ...draft, stateEventCount: 1 }), false);
  assert.equal(canHardDeleteContractFacts({ ...draft, revisionStates: ["draft", "confirmed"] }), false);
});

test("inclusive revision periods close on the prior business date", () => {
  assert.equal(previousBusinessDate("2026-01-01"), "2025-12-31");
  assert.equal(previousBusinessDate("invalid"), null);
});
