import assert from "node:assert/strict";
import test from "node:test";

import type { AgentResponse, AgentRuntimeOutcome } from "./runtime/contracts";
import { AGENT_RUNTIME_MAX_TURN_MS } from "./runtime/contracts";
import {
  AGENT_RUN_RECONCILIATION_GRACE_MS,
  AGENT_RUN_MAX_QUEUE_WAIT_MS,
  agentRunTerminalDecision,
  normalizeAgentResponseForTerminalOutcome,
  staleAgentRunReconciliation,
} from "./run-status";

function response(type: AgentResponse["type"], runtimeOutcome?: AgentRuntimeOutcome): AgentResponse {
  return {
    type,
    message: type === "error" ? "真实业务错误" : "result",
    telemetry: runtimeOutcome ? {
      inputOtherTokens: null,
      inputCacheReadTokens: null,
      inputCacheCreationTokens: null,
      outputTokens: null,
      contextUsagePeak: null,
      runtimeStepCount: null,
      runtimeOutcome,
    } : undefined,
  };
}

test("error response is failed even when runtime reports cancellation", () => {
  assert.deepEqual(agentRunTerminalDecision(response("error", "cancelled")), {
    status: "failed",
    errorMessage: "真实业务错误",
  });
});

test("runtime cancellation is aborted and max-step exhaustion is failed as incomplete", () => {
  assert.deepEqual(agentRunTerminalDecision(response("answer", "cancelled")), {
    status: "aborted",
    errorMessage: "Agent runtime cancelled before completion",
  });
  assert.deepEqual(agentRunTerminalDecision(response("answer", "max_steps_reached")), {
    status: "failed",
    errorMessage: "Agent runtime reached its maximum steps; result may be incomplete",
  });
  assert.deepEqual(agentRunTerminalDecision(response("answer", "timed_out")), {
    status: "failed",
    errorMessage: "Agent runtime exceeded its maximum turn duration",
  });
});

test("only a non-error finished or non-runtime response succeeds", () => {
  assert.deepEqual(agentRunTerminalDecision(response("answer", "finished")), { status: "succeeded" });
  assert.deepEqual(agentRunTerminalDecision(response("proposal")), { status: "succeeded" });
});

test("non-finished runtime responses cannot masquerade as answers or pending proposals", () => {
  const cancelled = { ...response("proposal", "cancelled"), proposal: {
    id: 9,
    actionKey: "source.submit",
    targetType: "PullRequest",
    diff: {},
  } } satisfies AgentResponse;
  assert.deepEqual(normalizeAgentResponseForTerminalOutcome(cancelled), {
    ...cancelled,
    type: "error",
    message: "请求已中止。",
    data: undefined,
    proposal: undefined,
  });
  assert.equal(
    normalizeAgentResponseForTerminalOutcome(response("answer", "max_steps_reached")).message,
    "运行达到最大步骤，结果可能不完整，请重试。",
  );
  assert.equal(
    normalizeAgentResponseForTerminalOutcome(response("answer", "timed_out")).message,
    "处理请求超时，请重试。",
  );
});

test("stale running audits are failed after max turn duration plus reconciliation grace", () => {
  const now = new Date("2026-07-16T04:00:00.000Z");
  const reconciliation = staleAgentRunReconciliation(now);

  assert.equal(
    reconciliation.cutoff.toISOString(),
    new Date(
      now.getTime() - AGENT_RUN_MAX_QUEUE_WAIT_MS - AGENT_RUNTIME_MAX_TURN_MS - AGENT_RUN_RECONCILIATION_GRACE_MS,
    ).toISOString(),
  );
  assert.deepEqual(reconciliation.data, {
    status: "failed",
    resultType: "error",
    errorMessage: "Agent run exceeded the queue/runtime limit and reconciliation grace; the previous process did not finalize its audit record",
    finishedAt: now,
  });
});
