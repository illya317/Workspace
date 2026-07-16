import assert from "node:assert/strict";
import test from "node:test";

import type { SessionUser } from "@workspace/platform/types";

import type { AgentExecutionContext } from "./execution";
import { resolveAgentToolAccess } from "./capabilities";
import type { AgentTool } from "./tools";

const requester: SessionUser = { id: 11, username: "requester", isSuperAdmin: true };
const actor: SessionUser = { id: 22, username: "agent-actor", canLogin: false };

function tool(
  key: string,
  action: "read" | "submit" = "read",
  delegatedExecution = true,
  requiresAgentProfile = false,
): AgentTool {
  return {
    key,
    label: key,
    description: key,
    requiredPermissions: [{ resourceKey: "agent.source", action }],
    delegatedExecution,
    requiresAgentProfile,
    mutates: action === "submit",
    execute: async () => ({ type: "data", message: "ok" }),
  };
}

function delegatedExecution(allowedToolKeys: string[]): AgentExecutionContext {
  return {
    requester,
    actor,
    profile: {
      id: 3,
      key: "development.test",
      displayName: "Test Agent",
      roleName: "Tester",
      responsibilities: "Test authorization",
      allowedToolKeys,
      runtime: {
        bindingId: 7,
        kind: "workspace",
        instructions: "Test Workspace runtime",
      },
      actorEmployeeId: "AI0099",
      actorEmployeeName: "测试 Agent",
    },
  };
}

test("delegated tools require profile allowlist, explicit adapter opt-in and both live identities", async () => {
  const calls: string[] = [];
  const allowed = tool("source.searchWorkspaceCode");
  const notAllowlisted = tool("source.proposePullRequest", "submit");
  const notDelegated = tool("library.searchDocuments", "read", false);
  const result = await resolveAgentToolAccess(
    delegatedExecution([allowed.key, notDelegated.key]),
    [allowed, notAllowlisted, notDelegated],
    {
      agentAllowedActions: ["read", "submit"],
      executionRefresher: async (execution) => execution,
      permissionEvaluator: async (userId, resourceKey, action) => {
        calls.push(`${userId}:${resourceKey}:${action}`);
        return true;
      },
    },
  );

  assert.deepEqual(result.tools.map((item) => item.key), [allowed.key]);
  assert.deepEqual(calls.sort(), ["11:agent.source:read", "22:agent.source:read"]);
});

test("profile-only tools stay unavailable to the personal assistant even with a live source grant", async () => {
  let permissionChecks = 0;
  const candidate = tool("source.searchWorkspaceCode", "read", true, true);
  const result = await resolveAgentToolAccess(requester, [candidate], {
    agentAllowedActions: ["read"],
    permissionEvaluator: async () => {
      permissionChecks += 1;
      return true;
    },
  });

  assert.deepEqual(result.tools, []);
  assert.equal(permissionChecks, 0);
});

test("configuration preview can discover a profile-only tool from the virtual actor's live grant", async () => {
  const calls: string[] = [];
  const candidate = tool("source.searchWorkspaceCode", "read", true, true);
  const result = await resolveAgentToolAccess(actor, [candidate], {
    accessMode: "configuration_preview",
    agentAllowedActions: ["read"],
    permissionEvaluator: async (userId, resourceKey, action) => {
      calls.push(`${userId}:${resourceKey}:${action}`);
      return true;
    },
  });

  assert.deepEqual(result.tools.map((item) => item.key), [candidate.key]);
  assert.deepEqual(calls, ["22:agent.source:read"]);
});

test("requester super-admin status cannot bypass a denied virtual actor", async () => {
  const candidate = tool("source.searchWorkspaceCode");
  const result = await resolveAgentToolAccess(
    delegatedExecution([candidate.key]),
    [candidate],
    {
      agentAllowedActions: ["read"],
      executionRefresher: async (execution) => execution,
      permissionEvaluator: async (userId) => userId === requester.id,
    },
  );
  assert.deepEqual(result.tools, []);
});

test("global Agent action ceiling narrows a profile even when both identities are allowed", async () => {
  const candidate = tool("source.proposePullRequest", "submit");
  let permissionChecks = 0;
  const result = await resolveAgentToolAccess(
    delegatedExecution([candidate.key]),
    [candidate],
    {
      agentAllowedActions: ["read"],
      executionRefresher: async (execution) => execution,
      permissionEvaluator: async () => {
        permissionChecks += 1;
        return true;
      },
    },
  );
  assert.deepEqual(result.tools, []);
  assert.equal(permissionChecks, 0);
});

test("live profile refresh revokes a tool removed after the conversation started", async () => {
  const candidate = tool("source.searchWorkspaceCode");
  const result = await resolveAgentToolAccess(
    delegatedExecution([candidate.key]),
    [candidate],
    {
      agentAllowedActions: ["read"],
      executionRefresher: async (execution) => ({
        ...execution,
        profile: execution.profile ? { ...execution.profile, allowedToolKeys: [] } : null,
      }),
      permissionEvaluator: async () => true,
    },
  );
  assert.deepEqual(result.tools, []);
});

test("live profile refresh fails closed when the bound actor changes", async () => {
  const candidate = tool("source.searchWorkspaceCode");
  const result = await resolveAgentToolAccess(
    delegatedExecution([candidate.key]),
    [candidate],
    {
      agentAllowedActions: ["read"],
      executionRefresher: async (execution) => ({
        ...execution,
        actor: { ...execution.actor, id: 23 },
      }),
      permissionEvaluator: async () => true,
    },
  );
  assert.deepEqual(result.tools, []);
});
