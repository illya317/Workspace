import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { findApiContract } from "@workspace/platform/api-registry";

import type { AgentExecutionContext } from "./execution";

const permissionCalls: string[] = [];
mock.module("@workspace/platform/server/system-config", {
  exports: {
    getSystemConfig: async () => ({
      agentAllowedActions: [
        "entry", "read", "create", "update", "delete", "archive", "revise",
        "submit", "reverse", "approve", "reject", "export", "configure", "grant", "audit",
      ],
    }),
  },
} as never);
mock.module("../rbac/action-grants", {
  exports: {
    evaluatePermissionAction: async (userId: number, resourceKey: string, action: string) => {
      permissionCalls.push(`${userId}:${resourceKey}:${action}`);
      return true;
    },
  },
} as never);
mock.module("../rbac/resource-entry", {
  exports: {
    canEnterResource: async (userId: number, resourceKey: string) => {
      permissionCalls.push(`${userId}:${resourceKey}:entry`);
      return true;
    },
  },
} as never);

const { canAgentExecutionUseBusinessApi } = await import("./business-api-authorization");

const delegated: AgentExecutionContext = {
  requester: { id: 11, username: "requester" },
  actor: { id: 22, username: "virtual-agent", canLogin: false },
  profile: {
    id: 7,
    key: "workspace.business-assistant",
    displayName: "Business Agent",
    roleName: "Assistant",
    responsibilities: "API only",
    allowedToolKeys: ["workspace.api.read"],
    runtime: { bindingId: 9, kind: "workspace", instructions: "API only" },
    actorEmployeeId: "AI0004",
    actorEmployeeName: "Business Agent",
  },
};

test("virtual Agent fails closed for service-delegated object authorization", async () => {
  const contract = findApiContract("GET", "/api/modules/work/tasks/spaces");
  assert.ok(contract);
  assert.equal(contract.runtimeEnforcement, "serviceDelegated");
  permissionCalls.length = 0;
  assert.equal(await canAgentExecutionUseBusinessApi(delegated, contract), false);
  assert.deepEqual(permissionCalls, []);
});

test("gateway-enforced API checks requester and virtual actor through one connector seam", async () => {
  const contract = findApiContract("GET", "/api/modules/finance/budget");
  assert.ok(contract);
  assert.equal(contract.runtimeEnforcement, "gateway");
  permissionCalls.length = 0;
  assert.equal(await canAgentExecutionUseBusinessApi(delegated, contract), true);
  assert.equal(permissionCalls.some((call) => call.startsWith("11:")), true);
  assert.equal(permissionCalls.some((call) => call.startsWith("22:")), true);
});
