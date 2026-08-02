import { AGENT_RUNTIME_MAX_TURN_MS, type AgentResponse } from "./runtime/contracts";
import { MAX_CONCURRENT_AGENT_TURNS, MAX_QUEUED_AGENT_TURNS } from "./runtime/turn-limiter";

export const AGENT_RUN_RECONCILIATION_GRACE_MS = 2 * 60 * 1_000;
export const AGENT_RUN_MAX_QUEUE_WAIT_MS = Math.ceil(MAX_QUEUED_AGENT_TURNS / MAX_CONCURRENT_AGENT_TURNS)
  * AGENT_RUNTIME_MAX_TURN_MS;

export type AgentRunTerminalDecision = {
  status: "succeeded" | "failed" | "aborted";
  errorMessage?: string;
};

export function agentRunTerminalDecision(response: AgentResponse): AgentRunTerminalDecision {
  if (response.type === "error") {
    return {
      status: "failed",
      errorMessage: response.message.trim() || "Agent returned an error response",
    };
  }

  switch (response.telemetry?.runtimeOutcome) {
    case "cancelled":
      return { status: "aborted", errorMessage: "Agent runtime cancelled before completion" };
    case "max_steps_reached":
      return { status: "failed", errorMessage: "Agent runtime reached its maximum steps; result may be incomplete" };
    case "timed_out":
      return { status: "failed", errorMessage: "Agent runtime exceeded its maximum turn duration" };
    case "finished":
    case undefined:
      return { status: "succeeded" };
  }
}

export function normalizeAgentResponseForTerminalOutcome(response: AgentResponse): AgentResponse {
  if (response.type === "error") return response.proposal ? { ...response, proposal: undefined } : response;
  if (response.telemetry?.runtimeOutcome === "finished" || !response.telemetry) return response;
  const message = response.telemetry.runtimeOutcome === "cancelled"
    ? "请求已中止。"
    : response.telemetry.runtimeOutcome === "timed_out"
      ? "处理请求超时，请重试。"
      : "运行达到最大步骤，结果可能不完整，请重试。";
  return { ...response, type: "error", message, data: undefined, proposal: undefined };
}

export function staleAgentRunReconciliation(now = new Date()) {
  // The audit row starts before the global turn limiter is acquired, so a
  // legitimate queued turn needs the configured worst-case queue budget too.
  const staleAfterMs = AGENT_RUN_MAX_QUEUE_WAIT_MS + AGENT_RUNTIME_MAX_TURN_MS + AGENT_RUN_RECONCILIATION_GRACE_MS;
  return {
    cutoff: new Date(now.getTime() - staleAfterMs),
    data: {
      status: "failed" as const,
      resultType: "error",
      errorMessage: "Agent run exceeded the queue/runtime limit and reconciliation grace; the previous process did not finalize its audit record",
      finishedAt: now,
    },
  };
}
