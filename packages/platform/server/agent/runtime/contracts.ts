import type { AgentExecutionContext } from "../execution";
import type { AgentTool } from "../tools";
import type { AgentChoiceQuestion } from "../../../agent-conversation-choice";

export const AGENT_RUNTIME_MAX_TURN_MS = 15 * 60 * 1_000;

export interface HistoryMessage {
  role: "user" | "agent";
  content: string;
}

export interface AgentInputImage {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  storageKey?: string;
  model?: {
    mimeType: string;
    size: number;
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
    optimized: boolean;
  };
}

export type AgentRuntimeOutcome = "finished" | "cancelled" | "max_steps_reached" | "timed_out";
export type AgentRuntimeAbortKind = "request_cancelled" | "runtime_timeout" | "sdk_cancelled";

export interface AgentRunTelemetry {
  inputOtherTokens: number | null;
  inputCacheReadTokens: number | null;
  inputCacheCreationTokens: number | null;
  outputTokens: number | null;
  contextUsagePeak: number | null;
  runtimeStepCount: number | null;
  runtimeOutcome: AgentRuntimeOutcome;
}

export class AgentRuntimeAbortError extends Error {
  readonly telemetry: AgentRunTelemetry;
  readonly partialResponse?: AgentResponse;
  readonly kind: AgentRuntimeAbortKind;

  constructor(
    message: string,
    telemetry: AgentRunTelemetry,
    partialResponse?: AgentResponse,
    kind: AgentRuntimeAbortKind = "request_cancelled",
  ) {
    super(message);
    this.name = kind === "runtime_timeout" ? "TimeoutError" : "AbortError";
    this.telemetry = telemetry;
    this.partialResponse = partialResponse;
    this.kind = kind;
  }
}

export function agentRuntimeTelemetryFromError(error: unknown) {
  return error instanceof AgentRuntimeAbortError ? error.telemetry : undefined;
}

export function agentRuntimePartialResponseFromError(error: unknown) {
  return error instanceof AgentRuntimeAbortError ? error.partialResponse : undefined;
}

export function agentRuntimeAbortKindFromError(error: unknown) {
  return error instanceof AgentRuntimeAbortError ? error.kind : undefined;
}

export interface AgentResponse {
  type: "answer" | "error" | "clarification" | "proposal";
  message: string;
  toolUsed?: string;
  data?: unknown;
  choices?: AgentChoiceQuestion[];
  telemetry?: AgentRunTelemetry;
  proposal?: {
    id: number;
    actionKey: string;
    targetType: string;
    targetId?: string;
    diff: Record<string, unknown>;
  };
}

export interface AgentRuntimeInput {
  message: string;
  execution: AgentExecutionContext;
  tools: AgentTool[];
  history: HistoryMessage[];
  images: AgentInputImage[];
  identityContext?: string;
  onTextDelta?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface AgentRuntime {
  runTurn(input: AgentRuntimeInput): Promise<AgentResponse>;
}
