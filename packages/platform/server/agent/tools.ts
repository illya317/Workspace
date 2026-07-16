/**
 * Agent tool contracts.
 * Platform owns orchestration; domain packages own concrete tool adapters.
 */
import type { PermissionActionKey } from "@workspace/platform/permission-actions";

import type { AgentExecutionContext } from "./execution";

export interface AgentToolPermissionRequirement {
  resourceKey: string;
  action: PermissionActionKey;
}

export interface AgentToolResult {
  type: "data" | "error" | "empty" | "proposal";
  data?: unknown;
  /** Lean evidence sent to the model when the full response data is too large or UI-specific. */
  modelContext?: unknown;
  message: string;
  /** proposal 类型特有：待确认变更的详情 */
  proposal?: {
    id: number;
    actionKey: string;
    targetType: string;
    targetId?: string;
    diff: Record<string, unknown>;
  };
}

export interface AgentToolParameters {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AgentToolExample {
  user: string;
  arguments: Record<string, unknown>;
}

export interface AgentTool {
  key: string;
  label: string;
  description: string;
  /** OpenAI-compatible function-call JSON schema. */
  parameters?: AgentToolParameters;
  /** Few-shot hints used by tool-capable providers. */
  examples?: AgentToolExample[];
  /** Minimum actor permissions; the Agent action ceiling may only narrow them. */
  requiredPermissions: readonly AgentToolPermissionRequirement[];
  /** Explicit opt-in: the adapter is safe when requester and virtual actor differ. */
  delegatedExecution?: boolean;
  /** Explicit opt-in: this tool is unavailable to the profile-less personal assistant. */
  requiresAgentProfile?: boolean;
  /** true = 涉及写入，只能返回 proposal */
  mutates: boolean;
  execute: (params: Record<string, unknown>, execution: AgentExecutionContext) => Promise<AgentToolResult>;
}
