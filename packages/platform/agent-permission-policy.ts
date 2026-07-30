import {
  PERMISSION_ACTION_REGISTRY_KEYS as PERMISSION_ACTION_KEYS,
  isPermissionRegistryActionKey as isPermissionActionKey,
  type PermissionRegistryActionKey as PermissionActionKey,
} from "./action-registry";

/**
 * Agent action ceiling. This is intentionally an allowlist so newly registered
 * permission actions remain unavailable until a root administrator reviews them.
 */
export const DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS = [
  "entry",
  "read",
  "create",
  "update",
  "configure",
  "submit",
  "import",
  "export",
] as const satisfies readonly PermissionActionKey[];

export type AgentAllowedPermissionAction = PermissionActionKey;

export function normalizeAgentAllowedPermissionActions(
  value: unknown,
  fallback: readonly PermissionActionKey[] = DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS,
): PermissionActionKey[] {
  if (!Array.isArray(value)) return [...fallback];
  const requested = new Set(value.filter((item): item is PermissionActionKey => (
    typeof item === "string" && isPermissionActionKey(item)
  )));
  return PERMISSION_ACTION_KEYS.filter((action) => requested.has(action));
}

export function agentPolicyAllowsActions(
  requiredActions: readonly PermissionActionKey[],
  allowedActions: readonly PermissionActionKey[],
) {
  const allowed = new Set(allowedActions);
  return requiredActions.every((action) => allowed.has(action));
}
