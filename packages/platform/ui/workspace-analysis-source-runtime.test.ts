import assert from "node:assert/strict";
import test from "node:test";

import { WORKSPACE_ANALYSIS_HR_JOIN_DEFINITION_EXAMPLE } from "../workspace-analysis-source-contract";
import { loadWorkspaceAnalysisSource } from "./workspace-analysis-source-runtime";

test("loads a scope-bound Workspace GET source through explicit pagination", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    const page = new URL(url, "http://workspace.local").searchParams.get("page");
    return Response.json(page === "1"
      ? { items: [{ id: 1 }, { id: 2 }], total: 3 }
      : { items: [{ id: 3 }], total: 3 });
  };
  try {
    const source = {
      ...WORKSPACE_ANALYSIS_HR_JOIN_DEFINITION_EXAMPLE.sources[0],
      pagination: { totalPath: "total", pageSize: 2, maxPages: 2 },
    };
    const rows = await loadWorkspaceAnalysisSource(
      source,
      { scopeType: "department", scopeId: 12 },
      new AbortController().signal,
    );
    assert.deepEqual(rows.map((row) => row.id), [1, 2, 3]);
    assert.match(requests[0]!, /departmentId=12/);
    assert.match(requests[0]!, /page=1/);
    assert.match(requests[1]!, /page=2/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
