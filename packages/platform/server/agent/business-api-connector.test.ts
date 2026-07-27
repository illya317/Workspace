import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { AgentExecutionContext } from "./execution";

process.env.NEXTAUTH_SECRET = "agent-business-api-connector-test-secret";

let createdProposal: Record<string, unknown> | null = null;
mock.module("./business-api-authorization", {
  namedExports: { canAgentExecutionUseBusinessApi: async () => true },
} as never);
mock.module("./proposals", {
  namedExports: {
    createProposal: async (_execution: unknown, input: Record<string, unknown>) => {
      createdProposal = input;
      return { proposalId: 17, status: "pending", message: "待确认" };
    },
  },
} as never);
mock.module("@workspace/platform/server/internal-unit-rpc", {
  namedExports: {
    workspaceInternalApiUrl: (path: string) => new URL(path, "http://workspace.test"),
    readBoundedJsonResponse: (response: Response) => response.json(),
  },
} as never);

const {
  AGENT_BUSINESS_API_TOOL_KEYS,
  agentBusinessApiTools,
  executeAgentBusinessApiMutationProposal,
} = await import("./business-api-connector");

const execution: AgentExecutionContext = {
  requester: { id: 11, username: "requester" },
  actor: { id: 11, username: "requester" },
  profile: null,
  runId: "run_connector_test",
};

function tool(key: string) {
  const candidate = agentBusinessApiTools.find((item) => item.key === key);
  assert.ok(candidate);
  return candidate;
}

test("thin Agent exposes only three generic business API connectors", () => {
  assert.deepEqual(agentBusinessApiTools.map((item) => item.key), [...AGENT_BUSINESS_API_TOOL_KEYS]);
  assert.equal(agentBusinessApiTools.some((item) => /source|prisma|shell|rpc|finance\.|hr\.|work\.|docs\./i.test(item.key)), false);
});

test("API discovery returns standard contracts and never Agent endpoints", async () => {
  const result = await tool("workspace.api.discover").execute({ query: "经营分析" }, execution);
  assert.equal(result.type, "data");
  const serialized = JSON.stringify(result.data);
  assert.match(serialized, /\/api\/modules\/finance\/cost\/operational-analytics/);
  assert.doesNotMatch(serialized, /\/api\/agent/);
});

test("read connector rejects arbitrary origins, source paths and internal Agent RPC", async (t) => {
  let fetchCount = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCount += 1;
    return Response.json({ ok: true });
  });
  const read = tool("workspace.api.read");
  for (const path of [
    "https://example.test/api/modules/hr/roster",
    "/api/source/files",
    "/api/modules/hr/agent/rpc",
    "/api/modules/hr/../settings/admin",
  ]) {
    const result = await read.execute({ path }, execution);
    assert.equal(result.type, "error", path);
  }
  assert.equal(fetchCount, 0);
});

test("read connector calls a registered same-origin GET with only a short-lived delegation", async (t) => {
  const captured: Request[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    captured.push(new Request(input, init));
    return Response.json({ success: true, data: { year: 2026 } });
  });
  const result = await tool("workspace.api.read").execute({
    path: "/api/modules/finance/budget?year=2026",
  }, execution);
  assert.equal(result.type, "data");
  const request = captured[0];
  assert.ok(request);
  assert.equal(request.method, "GET");
  assert.equal(new URL(request.url).origin, "http://workspace.test");
  assert.ok(request.headers.get("x-workspace-agent-api-delegation"));
  assert.equal(request.headers.has("cookie"), false);
  assert.equal(request.headers.has("x-api-key"), false);
  assert.equal(request.headers.has("authorization"), false);
});

test("mutation connector stores an immutable API proposal without dispatching the write", async (t) => {
  let fetchCount = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCount += 1;
    return Response.json({ success: true });
  });
  const result = await tool("workspace.api.proposeMutation").execute({
    method: "PUT",
    path: "/api/modules/work/tasks/41",
    body: { title: "更新后的工作" },
  }, execution);
  assert.equal(result.type, "proposal");
  assert.equal(fetchCount, 0);
  assert.deepEqual(createdProposal, {
    actionKey: "agent.businessApi.mutation.execute",
    toolKey: "workspace.api.proposeMutation",
    targetType: "WorkspaceBusinessApi",
    targetId: "PUT /api/modules/work/tasks/41",
    payload: {
      method: "PUT",
      path: "/api/modules/work/tasks/41",
      body: { title: "更新后的工作" },
    },
    diff: {
      method: "PUT",
      path: "/api/modules/work/tasks/41",
      body: { title: "更新后的工作" },
    },
  });
});

test("proposal execution marks the uncertain boundary immediately before HTTP dispatch", async (t) => {
  let dispatchMarked = false;
  t.mock.method(globalThis, "fetch", async () => {
    assert.equal(dispatchMarked, true);
    return Response.json({ success: true });
  });

  const result = await executeAgentBusinessApiMutationProposal({
    method: "PUT",
    path: "/api/modules/work/tasks/41",
    body: { title: "已确认" },
  }, execution, () => {
    dispatchMarked = true;
  });

  assert.equal(dispatchMarked, true);
  assert.equal(result.response.status, 200);
});
