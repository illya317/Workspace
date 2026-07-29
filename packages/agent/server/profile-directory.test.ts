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
const actor: SessionUser = { id: 22, username: "synthetic-agent-user", canLogin: false };

const businessApiTool: AgentTool = {
  key: "workspace.api.read",
  label: "读取 Workspace 业务 API",
  description: "test",
  requiredPermissions: [{ resourceKey: "agent.assistant", action: "read" }],
  delegatedExecution: true,
  mutates: false,
  execute: async () => ({ type: "data", message: "ok" }),
};

function execution(): AgentExecutionContext {
  return {
    requester,
    actor,
    profile: {
      id: 4,
      key: "synthetic.agent.profile",
      displayName: "示例提案助理",
      roleName: "AI查询与变更提案助理",
      responsibilities: "业务查询与变更提案",
      allowedToolKeys: [businessApiTool.key],
      runtime: { bindingId: 8, kind: "workspace", instructions: "test" },
      actorEmployeeId: "BOT-X004",
      actorEmployeeName: "示例提案助理",
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

test("profile discovery hides the synthetic profile when the requester lacks the business API connector grant", async () => {
  const profiles = await listAvailableAgentProfiles(
    requester,
    [businessApiTool],
    directoryDependencies(async (userId) => userId === actor.id),
  );

  assert.deepEqual(profiles, []);
});

test("profile discovery exposes the synthetic profile when requester and actor can use a registered API connector", async () => {
  const permissionChecks: string[] = [];
  const profiles = await listAvailableAgentProfiles(
    requester,
    [businessApiTool],
    directoryDependencies(async (userId, resourceKey, action) => {
      permissionChecks.push(`${userId}:${resourceKey}:${action}`);
      return true;
    }),
  );

  assert.deepEqual(profiles, [{
    id: 4,
    displayName: "示例提案助理",
    roleName: "AI查询与变更提案助理",
  }]);
  assert.deepEqual(permissionChecks.sort(), [
    "11:agent.assistant:read",
    "22:agent.assistant:read",
  ]);
});
