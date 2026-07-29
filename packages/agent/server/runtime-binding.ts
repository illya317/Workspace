export const AGENT_RUNTIME_KINDS = {
  workspace: "workspace",
  codexLocal: "codex_local",
  ci: "ci",
  serverOps: "server_ops",
} as const;

export type AgentRuntimeKind = typeof AGENT_RUNTIME_KINDS[keyof typeof AGENT_RUNTIME_KINDS];

/** Workspace runtimes expose only the generic protected-business-API connector. */
export const WORKSPACE_AGENT_CAPABILITY_KEYS = [
  "workspace.api.discover",
  "workspace.api.read",
  "workspace.api.proposeMutation",
] as const;

export const ACTIVE_WORKSPACE_RUNTIME_WHERE = {
  runtimeKind: AGENT_RUNTIME_KINDS.workspace,
  status: "active",
  interactive: true,
} as const;

export function parseAgentCapabilityKeys(value: string) {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed)
    || parsed.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error("capability keys must be a string array");
  }
  return [...new Set(parsed.map((item) => item.trim()))];
}

export function normalizeAgentRuntimeInstructions(value: string) {
  const instructions = value.trim();
  if (!instructions) {
    throw new Error("runtime instructions must not be empty");
  }
  return instructions;
}
