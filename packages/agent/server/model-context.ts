import type { AgentToolResult } from "./tools";

export const AGENT_MODEL_CONTEXT_CHAR_BUDGET = 32_000;

export type AgentToolModelProjection = {
  type: AgentToolResult["type"];
  message: string;
  data?: unknown;
};

export function projectAgentToolResult(result: AgentToolResult): AgentToolModelProjection {
  const data = typeof result.modelContext === "undefined" ? result.data : result.modelContext;
  return typeof data === "undefined"
    ? { type: result.type, message: result.message }
    : { type: result.type, message: result.message, data };
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return JSON.stringify({
      serializationError: true,
      reason: "model_context_not_json_serializable",
    });
  }
}

function truncatedEnvelope(json: string, prefixLength: number) {
  return JSON.stringify({
    truncated: true,
    reason: "model_context_exceeded_character_budget",
    originalChars: json.length,
    budgetChars: AGENT_MODEL_CONTEXT_CHAR_BUDGET,
    jsonPrefix: json.slice(0, prefixLength),
  });
}

export function serializeAgentModelContext(value: unknown): string {
  const json = stringifyJson(value);
  if (json.length <= AGENT_MODEL_CONTEXT_CHAR_BUDGET) return json;

  let lower = 0;
  let upper = Math.min(json.length, AGENT_MODEL_CONTEXT_CHAR_BUDGET);
  let compact = truncatedEnvelope(json, 0);
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = truncatedEnvelope(json, middle);
    if (candidate.length <= AGENT_MODEL_CONTEXT_CHAR_BUDGET) {
      compact = candidate;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }
  return compact;
}
