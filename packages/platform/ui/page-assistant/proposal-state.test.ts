import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAssistantProposalStatus,
  proposalCanSettle,
  proposalStatusLabel,
  successfulSettlementStatus,
} from "./proposal-state";

test("proposal status parsing accepts only server lifecycle states", () => {
  assert.equal(parseAssistantProposalStatus("failed"), "failed");
  assert.equal(parseAssistantProposalStatus("expired"), "expired");
  assert.equal(parseAssistantProposalStatus("unknown"), null);
  assert.equal(parseAssistantProposalStatus(null), null);
});

test("only pending proposals keep confirmation controls enabled", () => {
  assert.equal(proposalCanSettle("pending"), true);
  assert.equal(proposalCanSettle("executing"), false);
  assert.equal(proposalCanSettle("failed"), false);
  assert.equal(proposalCanSettle("expired"), false);
  assert.equal(proposalCanSettle(undefined), false);
});

test("proposal lifecycle labels and successful response fallback stay deterministic", () => {
  assert.equal(proposalStatusLabel("executing"), "执行中");
  assert.equal(proposalStatusLabel("failed"), "执行失败");
  assert.equal(proposalStatusLabel("expired"), "已过期");
  assert.equal(successfulSettlementStatus("confirm", "confirmed"), "confirmed");
  assert.equal(successfulSettlementStatus("cancel", undefined), "cancelled");
});
