import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_PROPOSAL_EXECUTION_LEASE_MS,
  agentProposalFailureResult,
  isAgentProposalExecutionStale,
  serializeAgentProposalExecutionResult,
} from "./proposal-execution-lease";

test("an execution claim becomes stale only after its lease", () => {
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  assert.equal(isAgentProposalExecutionStale(null, now), true);
  assert.equal(isAgentProposalExecutionStale(
    new Date(now - AGENT_PROPOSAL_EXECUTION_LEASE_MS),
    now,
  ), false);
  assert.equal(isAgentProposalExecutionStale(
    new Date(now - AGENT_PROPOSAL_EXECUTION_LEASE_MS - 1),
    now,
  ), true);
});

test("proposal results must be JSON serializable before a claim is finalized", () => {
  assert.equal(serializeAgentProposalExecutionResult({ ok: true }), '{"ok":true}');
  assert.throws(() => serializeAgentProposalExecutionResult(undefined), /不可审计/);
  assert.throws(() => serializeAgentProposalExecutionResult(1n), /BigInt/);
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.throws(() => serializeAgentProposalExecutionResult(circular), /circular/i);
});

test("uncertain executor failures are explicitly marked for reconciliation", () => {
  assert.deepEqual(agentProposalFailureResult(new Error("connection lost"), true), {
    error: "connection lost",
    outcomeUnknown: true,
    requiresManualReconciliation: true,
  });
  assert.deepEqual(agentProposalFailureResult("validation failed", false), {
    error: "validation failed",
    outcomeUnknown: false,
    requiresManualReconciliation: false,
  });
});
