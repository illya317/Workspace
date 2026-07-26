import assert from "node:assert/strict";
import test from "node:test";

import { deriveRuleCandidateDecision } from "./candidate-state";

test("only historically abnormal accounts remain unconfirmed without a manual rule", () => {
  assert.equal(deriveRuleCandidateDecision(null, true), null);
  assert.equal(deriveRuleCandidateDecision(null, false), "no_reclass");
});

test("manual decisions override the historical balance-derived state", () => {
  assert.equal(deriveRuleCandidateDecision("reclassify", false), "reclassify");
  assert.equal(deriveRuleCandidateDecision("no_reclass", true), "no_reclass");
});
