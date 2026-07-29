/**
 * 根据 SessionUser 权限生成可用能力清单。
 * Agent 只能使用当前用户有权限的工具。
 */
import { agentPolicyAllowsActions } from "@workspace/platform/agent-permission-policy";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import { getSystemConfig } from "@workspace/platform/server/system-config";

import { canEnterResource } from "@workspace/platform/server/rbac/resource-entry";
import {
  normalizeAgentExecutionContext,
  type AgentExecutionContext,
  type AgentExecutionPrincipal,
} from "./execution";
import type { AgentTool } from "./tools";

export type AgentPermissionEvaluator = (
  userId: number,
  resourceKey: string,
  action: AgentTool["requiredPermissions"][number]["action"],
) => Promise<boolean>;

export interface ResolveAgentToolAccessOptions {
  agentAllowedActions?: Awaited<ReturnType<typeof getSystemConfig>>["agentAllowedActions"];
  permissionEvaluator?: AgentPermissionEvaluator;
  /** Configuration discovery checks the virtual actor and global ceiling before a profile allowlist exists. */
  accessMode?: "runtime" | "configuration_preview";
  /** Deterministic test seam; production always refreshes the selected profile from canonical HR/account facts. */
  executionRefresher?: (execution: AgentExecutionContext) => Promise<AgentExecutionContext>;
}

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
  execution?: AgentExecutionContext;
}

export async function resolveAgentToolAccess(
  principal: AgentExecutionPrincipal,
  tools: AgentTool[],
  options: ResolveAgentToolAccessOptions = {},
): Promise<AgentToolAccessResolution> {
  const initialExecution = normalizeAgentExecutionContext(principal);
  const execution = initialExecution.profile
    ? await (options.executionRefresher ?? ((current) => (
      import("./execution-context").then(({ resolveAgentExecutionContext }) => (
        resolveAgentExecutionContext(current.requester, current.profile?.id)
      ))
    )))(initialExecution)
    : initialExecution;
  if (
    initialExecution.profile
    && (!execution.profile || execution.actor.id !== initialExecution.actor.id)
  ) {
    return { tools: [], capabilities: [], execution };
  }
  const agentAllowedActions = options.agentAllowedActions
    ?? (await getSystemConfig()).agentAllowedActions;
  const configurationPreview = options.accessMode === "configuration_preview";
  const permissionChecks = new Map<string, Promise<boolean>>();

  function identityHasPermission(userId: number, resourceKey: string, action: AgentTool["requiredPermissions"][number]["action"]) {
    const key = `${userId}\u0000${resourceKey}\u0000${action}`;
    let check = permissionChecks.get(key);
    if (!check) {
      check = options.permissionEvaluator
        ? options.permissionEvaluator(userId, resourceKey, action)
        : action === "entry"
          ? canEnterResource(userId, resourceKey)
          : evaluatePermissionAction(userId, resourceKey, action);
      permissionChecks.set(key, check);
    }
    return check;
  }

  const decisions = await Promise.all(tools.map(async (tool) => {
    if (configurationPreview && !tool.delegatedExecution) return false;
    if (!configurationPreview && tool.requiresAgentProfile && !execution.profile) return false;
    if (execution.profile && !tool.delegatedExecution) return false;
    if (!configurationPreview && execution.profile && !execution.profile.allowedToolKeys.includes(tool.key)) return false;
    const policyActions = tool.policyActions ?? tool.requiredPermissions.map((requirement) => requirement.action);
    if (!agentPolicyAllowsActions(policyActions, agentAllowedActions)) return false;
    const identities = execution.requester.id === execution.actor.id
      ? [execution.requester]
      : [execution.requester, execution.actor];
    const permissions = await Promise.all(identities.flatMap((identity) => (
      tool.requiredPermissions.map((requirement) => (
        identityHasPermission(identity.id, requirement.resourceKey, requirement.action)
      ))
    )));
    return permissions.every(Boolean);
  }));
  const allowedTools = tools.filter((_tool, index) => decisions[index]);
  return {
    tools: allowedTools,
    execution,
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
