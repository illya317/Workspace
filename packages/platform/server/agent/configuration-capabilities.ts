import "server-only";

import { getAgentActorSessionUser } from "../auth/session";
import { resolveAgentToolAccess, type Capability } from "./capabilities";
import type { AgentTool } from "./tools";

function uniqueDelegatedTools(tools: readonly AgentTool[]) {
  const byKey = new Map<string, AgentTool>();
  for (const tool of tools) {
    if (!tool.delegatedExecution) continue;
    if (byKey.has(tool.key)) {
      throw new Error(`Duplicate registered Agent tool key: ${tool.key}`);
    }
    byKey.set(tool.key, tool);
  }
  return [...byKey.values()];
}

/**
 * Configuration candidates are system-registered delegated tools that the
 * virtual actor itself can use under the global Agent action ceiling. The
 * requester is intentionally absent here; each real turn intersects the
 * saved allowlist with both requester and actor permissions again.
 */
export async function listConfigurableWorkspaceCapabilities(
  actorUserId: number,
  registeredTools: readonly AgentTool[],
): Promise<Capability[]> {
  const actor = await getAgentActorSessionUser(actorUserId);
  if (!actor) return [];
  const { capabilities } = await resolveAgentToolAccess(actor, uniqueDelegatedTools(registeredTools), {
    accessMode: "configuration_preview",
  });
  return [...capabilities].sort((left, right) => left.key.localeCompare(right.key));
}
