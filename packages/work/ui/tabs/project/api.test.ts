import assert from "node:assert/strict";
import test from "node:test";

import { deleteProject, deleteProjectPlanPhase, syncMembers } from "./api";
import { createEmptyProjectDraft, type ProjectMemberEntry } from "./model";

test("project and membership mutations carry optimistic versions", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    await deleteProject(25, 4);
    await syncMembers(25, { ...createEmptyProjectDraft(), id: 25 }, [{
      id: 30,
      version: 1,
      employeeId: 6014,
      employeeNumber: "6014",
      employeeName: "测试员工甲",
      projectId: 25,
      projectName: "企业信息化",
      role: "执行负责",
      startDate: null,
      endDate: null,
    } satisfies ProjectMemberEntry]);
    await syncMembers(25, {
      ...createEmptyProjectDraft(),
      id: 25,
      leader: { id: 6014, employeeNumber: "6014", name: "测试员工甲" },
    }, [{
      id: 31,
      version: 3,
      employeeId: 6014,
      employeeNumber: "6014",
      employeeName: "测试员工甲",
      projectId: 25,
      projectName: "企业信息化",
      role: "执行负责",
      startDate: null,
      endDate: null,
    } satisfies ProjectMemberEntry]);
    await deleteProjectPlanPhase(25, 9, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls.map((call) => ({
    path: new URL(call.input, "http://localhost").pathname,
    method: call.init?.method,
    ifMatch: new Headers(call.init?.headers).get("If-Match"),
    hasIdempotencyKey: new Headers(call.init?.headers).has("Idempotency-Key"),
  })), [
    { path: "/workspace/api/modules/work/projects/25", method: "DELETE", ifMatch: "4", hasIdempotencyKey: false },
    { path: "/workspace/api/modules/work/projects/members/30", method: "DELETE", ifMatch: "1", hasIdempotencyKey: true },
    {
      path: "/workspace/api/modules/work/projects/members/31",
      method: "PUT",
      ifMatch: "3",
      hasIdempotencyKey: true,
    },
    { path: "/workspace/api/modules/work/projects/25/plan-phases/9", method: "DELETE", ifMatch: "2", hasIdempotencyKey: false },
  ]);
});
