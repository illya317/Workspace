import assert from "node:assert/strict";
import test from "node:test";

import { deleteWorkKpiDefinition, listWorkKpiDefinitions } from "./WorkKpiApi";

test("KPI definition library can request retired versions", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ definitions: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    await listWorkKpiDefinitions({ targetType: "department", targetId: 7 }, 7, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const url = new URL(calls[0] ?? "", "http://localhost");
  assert.equal(url.pathname, "/workspace/api/modules/work/tasks/kpi/definitions");
  assert.equal(url.searchParams.get("ownerDepartmentId"), "7");
  assert.equal(url.searchParams.get("includeRetired"), "true");
});

test("KPI definition delete carries its optimistic version", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ success: true, id: 17 }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    await deleteWorkKpiDefinition({ id: 17, version: 3 });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls.map((call) => ({
    path: new URL(call.input, "http://localhost").pathname,
    method: call.init?.method,
    headers: call.init?.headers,
  })), [{
    path: "/workspace/api/modules/work/tasks/kpi/definitions/17",
    method: "DELETE",
    headers: { "Content-Type": "application/json", "If-Match": "3" },
  }]);
});
