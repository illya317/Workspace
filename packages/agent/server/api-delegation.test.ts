import assert from "node:assert/strict";
import test from "node:test";

import type { AgentExecutionContext } from "./execution";

process.env.NEXTAUTH_SECRET = "agent-api-delegation-test-secret";
process.env.NEXT_PUBLIC_BASE_PATH = "/workspace";

const {
  AGENT_API_DELEGATION_HEADER,
  createAgentApiDelegationToken,
  verifyAgentApiDelegation,
} = await import("@workspace/platform/server/agent-api-delegation");

const execution: AgentExecutionContext = {
  requester: { id: 11, username: "requester" },
  actor: { id: 22, username: "virtual-agent", canLogin: false },
  profile: {
    id: 7,
    key: "workspace.business-assistant",
    displayName: "Business Agent",
    roleName: "Assistant",
    responsibilities: "Use protected business APIs only",
    allowedToolKeys: ["workspace.api.read"],
    runtime: { bindingId: 9, kind: "workspace", instructions: "API only" },
    actorEmployeeId: "AI0004",
    actorEmployeeName: "Business Agent",
  },
  runId: "run_test",
};

async function delegatedRequest(input: { method: string; path: string; body?: string }) {
  const body = input.body ?? "";
  const token = await createAgentApiDelegationToken({
    execution,
    method: input.method,
    target: input.path,
    body,
  });
  return new Request(`http://workspace.test/workspace${input.path}`, {
    method: input.method,
    headers: { [AGENT_API_DELEGATION_HEADER]: token },
    ...(body ? { body } : {}),
  });
}

test("Agent API delegation binds both identities and the exact business request", async () => {
  const request = await delegatedRequest({
    method: "PUT",
    path: "/api/modules/work/tasks/41?mode=edit",
    body: JSON.stringify({ title: "更新" }),
  });
  assert.deepEqual(await verifyAgentApiDelegation(request), {
    requesterId: 11,
    actorId: 22,
    profileId: 7,
    runId: "run_test",
  });
});

test("Agent API delegation rejects a changed method, path, query or body", async () => {
  const request = await delegatedRequest({
    method: "POST",
    path: "/api/modules/work/tasks",
    body: JSON.stringify({ title: "原值" }),
  });
  const token = request.headers.get(AGENT_API_DELEGATION_HEADER)!;
  const headers = { [AGENT_API_DELEGATION_HEADER]: token };
  assert.equal(await verifyAgentApiDelegation(new Request(request.url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ title: "原值" }),
  })), null);
  assert.equal(await verifyAgentApiDelegation(new Request(`${request.url}?extra=1`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "原值" }),
  })), null);
  assert.equal(await verifyAgentApiDelegation(new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "篡改" }),
  })), null);
});
