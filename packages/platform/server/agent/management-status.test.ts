import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_PROPOSAL_TTL_MS } from "./proposal-view";
import {
  deriveAgentReportStatus,
  effectiveAgentProposalStatus,
  mergeAgentSessionReportStatus,
} from "./management-status";

const NOW = Date.UTC(2026, 6, 16, 4, 30, 0);
const freshProposal = (status: string) => ({
  status,
  createdAt: new Date(NOW - 1_000),
});

test("terminal run state takes precedence over result type", () => {
  assert.equal(deriveAgentReportStatus({ status: "running", resultType: "proposal" }, freshProposal("confirmed"), NOW), "running");
  assert.equal(deriveAgentReportStatus({ status: "aborted", resultType: "answer" }, null, NOW), "aborted");
  assert.equal(deriveAgentReportStatus({ status: "failed", resultType: "answer" }, null, NOW), "failed");
  assert.equal(deriveAgentReportStatus({ status: "succeeded", resultType: "error" }, null, NOW), "failed");
});

test("proposal result follows the proposal current lifecycle", () => {
  const run = { status: "succeeded", resultType: "proposal" };
  assert.equal(deriveAgentReportStatus(run, freshProposal("pending"), NOW), "awaiting_confirmation");
  assert.equal(deriveAgentReportStatus(run, freshProposal("executing"), NOW), "running");
  assert.equal(deriveAgentReportStatus(run, freshProposal("confirmed"), NOW), "completed");
  assert.equal(deriveAgentReportStatus(run, freshProposal("cancelled"), NOW), "aborted");
  assert.equal(deriveAgentReportStatus(run, freshProposal("failed"), NOW), "failed");
  assert.equal(deriveAgentReportStatus(run, freshProposal("expired"), NOW), "failed");
  assert.equal(deriveAgentReportStatus(run, null, NOW), "awaiting_confirmation");
});

test("elapsed pending proposal is projected as expired without mutating it", () => {
  const proposal = {
    status: "pending",
    createdAt: new Date(NOW - AGENT_PROPOSAL_TTL_MS - 1),
  };
  assert.equal(effectiveAgentProposalStatus(proposal, NOW), "expired");
  assert.equal(
    deriveAgentReportStatus({ status: "succeeded", resultType: "proposal" }, proposal, NOW),
    "failed",
  );
});

test("clarification and ordinary successful results keep their semantic states", () => {
  assert.equal(deriveAgentReportStatus({ status: "succeeded", resultType: "clarification" }, null, NOW), "awaiting_input");
  assert.equal(deriveAgentReportStatus({ status: "succeeded", resultType: "answer" }, null, NOW), "completed");
});

test("active proposals are not hidden by a later ordinary session turn", () => {
  assert.equal(mergeAgentSessionReportStatus("completed", "pending"), "awaiting_confirmation");
  assert.equal(mergeAgentSessionReportStatus("failed", "pending"), "awaiting_confirmation");
  assert.equal(mergeAgentSessionReportStatus("completed", "executing"), "running");
  assert.equal(mergeAgentSessionReportStatus("running", "pending"), "running");
  assert.equal(mergeAgentSessionReportStatus("completed", null), "completed");
});
