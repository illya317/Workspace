/**
 * Agent tool contracts.
 * Platform owns orchestration; domain packages own concrete tool adapters.
 */
import type { PermissionRegistryActionKey } from "@workspace/platform/action-registry";

import type { AgentExecutionContext } from "./execution-contract";

export interface AgentToolPermissionRequirement {
  resourceKey: string;
  action: PermissionRegistryActionKey;
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
  /**
   * Optional actions checked only against the global Agent ceiling.
   * Use this when the live business permission is scoped and therefore cannot
   * be evaluated from a static root resource requirement.
   */
  policyActions?: readonly PermissionRegistryActionKey[];
  /** Explicit opt-in: the adapter is safe when requester and virtual actor differ. */
  delegatedExecution?: boolean;
  /** Explicit opt-in: this tool is unavailable to the profile-less personal assistant. */
  requiresAgentProfile?: boolean;
  /** true = writes Workspace data or creates a pending write proposal. */
  mutates: boolean;
  /** Mutating tools default to proposal-only; direct writes require an explicit opt-in. */
  writeMode?: "proposal" | "direct";
  execute: (params: Record<string, unknown>, execution: AgentExecutionContext) => Promise<AgentToolResult>;
}
