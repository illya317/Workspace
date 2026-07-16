import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@workspace/platform/types";

import {
  resolveAgentToolAccess,
  type AgentPermissionEvaluator,
} from "./capabilities";
import type { AgentExecutionContext } from "./execution";
import { listAvailableAgentProfiles } from "./profile-directory";
import type { AgentTool } from "./tools";

const requester: SessionUser = { id: 11, username: "requester" };
const actor: SessionUser = { id: 22, username: "agent-workspace-assistant", canLogin: false };

const sourceTool: AgentTool = {
  key: "source.searchWorkspaceCode",
  label: "检索 Workspace 源码",
  description: "test",
  requiredPermissions: [{ resourceKey: "agent.source", action: "read" }],
  delegatedExecution: true,
  requiresAgentProfile: true,
  mutates: false,
  execute: async () => ({ type: "data", message: "ok" }),
};

function execution(): AgentExecutionContext {
  return {
    requester,
    actor,
    profile: {
      id: 4,
      key: "workspace.business-assistant",
      displayName: "Workspace 提案助理",
      roleName: "AI查询与变更提案助理",
      responsibilities: "源码检索与 PR 提案",
      allowedToolKeys: [sourceTool.key],
      runtime: { bindingId: 8, kind: "workspace", instructions: "test" },
      actorEmployeeId: "AI0004",
      actorEmployeeName: "Workspace 提案助理",
    },
  };
}

function directoryDependencies(
  permissionEvaluator: AgentPermissionEvaluator,
) {
  return {
    loadProfileIds: async () => [{ id: 4 }],
    resolveExecution: async () => execution(),
    resolveToolAccess: (
      current: AgentExecutionContext,
      tools: readonly AgentTool[],
    ) => resolveAgentToolAccess(current, [...tools], {
      agentAllowedActions: ["read"],
      executionRefresher: async (value) => value,
      permissionEvaluator,
    }),
  };
}

test("profile discovery hides AI0004 when the requester lacks the source grant", async () => {
  const profiles = await listAvailableAgentProfiles(
    requester,
    [sourceTool],
    directoryDependencies(async (userId) => userId === actor.id),
  );

  assert.deepEqual(profiles, []);
});

test("profile discovery exposes AI0004 when requester and actor can use a registered source tool", async () => {
  const permissionChecks: string[] = [];
  const profiles = await listAvailableAgentProfiles(
    requester,
    [sourceTool],
    directoryDependencies(async (userId, resourceKey, action) => {
      permissionChecks.push(`${userId}:${resourceKey}:${action}`);
      return true;
    }),
  );

  assert.deepEqual(profiles, [{
    id: 4,
    displayName: "Workspace 提案助理",
    roleName: "AI查询与变更提案助理",
  }]);
  assert.deepEqual(permissionChecks.sort(), [
    "11:agent.source:read",
    "22:agent.source:read",
  ]);
});
