import type { SessionUser } from "@workspace/platform/types";

import type { AgentTool } from "../tools";

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

export interface AgentResponse {
  type: "answer" | "error" | "clarification" | "proposal";
  message: string;
  toolUsed?: string;
  data?: unknown;
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
  user: SessionUser;
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
