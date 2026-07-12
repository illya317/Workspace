/**
 * 根据 SessionUser 权限生成可用能力清单。
 * Agent 只能使用当前用户有权限的工具。
 */
import type { SessionUser } from "@workspace/platform/types";
import { agentPolicyAllowsActions } from "@workspace/platform/agent-permission-policy";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import { getSystemConfig } from "@workspace/platform/server/system-config";

import type { AgentTool } from "./tools";

export interface Capability {
  key: string;
  label: string;
  description: string;
  /** 说明：该能力来自哪个工具 */
  source: "tool";
}

export interface AgentToolAccessResolution {
  tools: AgentTool[];
  capabilities: Capability[];
}

export async function resolveAgentToolAccess(
  user: SessionUser,
  tools: AgentTool[],
): Promise<AgentToolAccessResolution> {
  const { agentAllowedActions } = await getSystemConfig();
  const permissionChecks = new Map<string, Promise<boolean>>();

  function actorHasPermission(resourceKey: string, action: AgentTool["requiredPermissions"][number]["action"]) {
    if (user.isSuperAdmin) return Promise.resolve(true);
    const projected = action === "entry"
      ? user.visibleResourceKeys
      : action === "read"
        ? user.visibleReadResourceKeys
        : action === "update"
          ? user.visibleUpdateResourceKeys
          : action === "submit"
            ? user.visibleSubmitResourceKeys
            : null;
    if (projected) return Promise.resolve(projected.includes(resourceKey));
    const key = `${resourceKey}\u0000${action}`;
    let check = permissionChecks.get(key);
    if (!check) {
      check = evaluatePermissionAction(user.id, resourceKey, action);
      permissionChecks.set(key, check);
    }
    return check;
  }

  const decisions = await Promise.all(tools.map(async (tool) => {
    const requiredActions = tool.requiredPermissions.map((requirement) => requirement.action);
    if (!agentPolicyAllowsActions(requiredActions, agentAllowedActions)) return false;
    const permissions = await Promise.all(tool.requiredPermissions.map((requirement) => (
      actorHasPermission(requirement.resourceKey, requirement.action)
    )));
    return permissions.every(Boolean);
  }));
  const allowedTools = tools.filter((_tool, index) => decisions[index]);
  return {
    tools: allowedTools,
    capabilities: allowedTools.map((tool) => ({
      key: tool.key,
      label: tool.label,
      description: tool.description,
      source: "tool" as const,
    })),
  };
}

/** Find a tool only inside a previously resolved access list. */
export function findTool(key: string, tools: AgentTool[]): AgentTool | null {
  const tool = tools.find((t) => t.key === key);
  return tool ?? null;
}
