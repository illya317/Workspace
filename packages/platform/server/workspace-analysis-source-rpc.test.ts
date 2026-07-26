import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { clearResourceRuntimeStateCache } from "../effective-module-registry";
import {
  getDynamicModuleRuntimeOverrides,
  setDynamicModuleRuntimeOverrides,
  type ModuleRuntimeOverrideMap,
} from "../module-overrides";
import type { WorkspaceAnalysisSourceDefinition } from "../workspace-analysis-source-contract";

process.env.NEXTAUTH_SECRET = "workspace-analysis-source-rpc-test";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

mock.module("server-only", { namedExports: {} } as never);
mock.module("./api", {
  namedExports: {
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
  },
} as never);
mock.module("./auth", {
  namedExports: { getSessionUserFromAuthPayload: async () => null },
} as never);
mock.module("./api-route", {
  namedExports: {
    createInternalApiRoute: (options: {
      authorize: (context: { request: Request }) => Promise<boolean> | boolean;
      authorizeError?: string;
      handler: (context: { request: Request }) => Promise<unknown> | unknown;
    }) => async (request: Request) => {
      if (!await options.authorize({ request })) {
        return jsonResponse({ error: options.authorizeError }, 403);
      }
      const result = await options.handler({ request });
      if (result instanceof Response) return result;
      if (result && typeof result === "object" && (result as { ok?: boolean }).ok === false) {
        const failure = result as { error: string; status: number };
        return jsonResponse({ error: failure.error }, failure.status);
      }
      return jsonResponse(result);
    },
  },
} as never);

const {
  WorkspaceInternalRpcError,
  workspaceInternalRequestHeaders,
} = await import("./internal-unit-rpc");
const {
  createWorkspaceAnalysisSourceRpcHandler,
  loadRemoteWorkspaceAnalysisSources,
  loadRemoteWorkspaceAnalysisSource,
} = await import("./workspace-analysis-source-rpc");

const source = {
  sourceKey: "hr.employments",
  version: 1,
  label: "雇佣记录",
  description: "按目标部门收窄的雇佣记录。",
  ownerModuleKey: "hr",
  authorization: {
    resourceKey: "hr.roster",
    requiredActions: ["read"],
    projection: "default",
    enforcement: "gateway",
  },
  scopeBindings: { department: { mode: "target", description: "强制绑定部门。" } },
  parameters: [],
  fields: [{
    key: "employeeName",
    label: "姓名",
    description: "员工姓名。",
    kind: "text",
    sensitivity: "confidential",
    exportPolicy: "allowed",
    capabilities: { displayable: true, filterOperators: ["contains"], groupable: true, aggregateOperations: ["count"] },
  }],
  limits: { maxRows: 100, maxGroups: 20, maxPageSize: 100, maxPages: 1, maxBytes: 100_000, timeoutMs: 2_000 },
} as const satisfies WorkspaceAnalysisSourceDefinition;

function request(body: unknown, caller = "finance") {
  const pathname = ["", "workspace", "api", "modules", "hr", "internal", "workspace-analysis-sources"].join("/");
  const url = new URL(pathname, "http://127.0.0.1");
  const rawBody = JSON.stringify(body);
  return new Request(url, {
    method: "POST",
    headers: workspaceInternalRequestHeaders({
      audienceUnitId: "hr",
      body: rawBody,
      callerUnitId: caller,
      url,
    }),
    body: rawBody,
  });
}

const validBody = {
  schemaVersion: 1,
  operation: "catalog",
  requesterId: 7,
  targetType: "department",
  targetId: 12,
} as const;

const validExecuteBody = {
  schemaVersion: 1,
  operation: "execute",
  requesterId: 7,
  targetType: "department",
  targetId: 12,
  sourceKey: "hr.employments",
  sourceVersion: 1,
  parameters: {},
  fields: ["employeeName"],
  limits: { maxRows: 100, maxGroups: 20, pageSize: 100, maxPages: 1, maxBytes: 100_000, timeoutMs: 2_000 },
} as const;

test("source RPC returns only authorized metadata and never serializes adapters", async () => {
  const decisions: Array<{ requesterId: number; targetId: number; sourceKey: string }> = [];
  const handler = createWorkspaceAnalysisSourceRpcHandler({
    ownerUnitId: "hr",
    allowedCallerUnitIds: ["finance"],
    sourceCatalog: { list: () => [source] },
    requesterExists: async (requesterId) => requesterId === 7,
    canDiscover: async ({ requesterId, targetId, source: candidate }) => {
      decisions.push({ requesterId, targetId, sourceKey: candidate.sourceKey });
      return requesterId === 7 && targetId === 12;
    },
  });

  const response = await handler(request(validBody));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(decisions, [{ requesterId: 7, targetId: 12, sourceKey: "hr.employments" }]);
  assert.deepEqual(payload.sources.map((item: WorkspaceAnalysisSourceDefinition) => item.sourceKey), ["hr.employments"]);
  const serialized = JSON.stringify(payload);
  for (const forbidden of ["/api/modules", "adapter", "rowsPath", "fieldPaths", "pagination"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("source RPC blocks a disabled effective resource before discovery or execution callbacks", async () => {
  await withModuleRuntimeOverrides({ hr: { enabled: false } }, async () => {
    let discoveryCalls = 0;
    let executionCalls = 0;
    const handler = createWorkspaceAnalysisSourceRpcHandler({
      ownerUnitId: "hr",
      allowedCallerUnitIds: ["finance"],
      sourceCatalog: { list: () => [source] },
      requesterExists: async () => true,
      canDiscover: async () => {
        discoveryCalls += 1;
        return true;
      },
      executeSource: async (execution) => {
        executionCalls += 1;
        return {
          sourceKey: execution.sourceKey,
          sourceVersion: execution.sourceVersion,
          rows: [],
          pageCount: 1,
          byteCount: 2,
        };
      },
    });

    const catalogResponse = await handler(request(validBody));
    assert.equal(catalogResponse.status, 200);
    assert.deepEqual((await catalogResponse.json()).sources, []);
    assert.equal(discoveryCalls, 0);

    const executeResponse = await handler(request(validExecuteBody));
    assert.equal(executeResponse.status, 403);
    assert.equal(executionCalls, 0);
  });
});

test("source RPC restricts callers and validates the delegated requester", async () => {
  const handler = createWorkspaceAnalysisSourceRpcHandler({
    ownerUnitId: "hr",
    allowedCallerUnitIds: ["finance"],
    sourceCatalog: { list: () => [source] },
    requesterExists: async (requesterId) => requesterId === 7,
    canDiscover: async () => true,
  });

  assert.equal((await handler(request(validBody, "assistant"))).status, 403);
  assert.equal((await handler(request({ ...validBody, requesterId: 99 }))).status, 403);
  assert.equal((await handler(request({ ...validBody, targetType: "project" }))).status, 200);
  const projectPayload = await (await handler(request({ ...validBody, targetType: "project" }))).json();
  assert.deepEqual(projectPayload.sources, []);
});

test("source RPC rejects malformed request bodies before calling authorization policy", async () => {
  let calls = 0;
  const handler = createWorkspaceAnalysisSourceRpcHandler({
    ownerUnitId: "hr",
    allowedCallerUnitIds: ["finance"],
    sourceCatalog: { list: () => [source] },
    requesterExists: async () => true,
    canDiscover: async () => { calls += 1; return true; },
  });

  const response = await handler(request({ ...validBody, path: "not-allowed" }));
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("source RPC reports authorization infrastructure failures as unavailable", async () => {
  const handler = createWorkspaceAnalysisSourceRpcHandler({
    ownerUnitId: "hr",
    allowedCallerUnitIds: ["finance"],
    sourceCatalog: { list: () => [source] },
    requesterExists: async () => true,
    canDiscover: async () => { throw new Error("permission backend unavailable"); },
  });

  const response = await handler(request(validBody));
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(await response.json()).includes("permission backend unavailable"), false);
});

test("source RPC rejects non-canonical or foreign-owned catalog entries", async () => {
  for (const invalidSource of [
    { ...source, ownerModuleKey: "finance" },
    { ...source, scopeBindings: {} },
    {
      ...source,
      fields: [{
        ...source.fields[0],
        capabilities: { ...source.fields[0].capabilities, aggregateOperations: ["sum"] },
      }],
    },
  ]) {
    const handler = createWorkspaceAnalysisSourceRpcHandler({
      ownerUnitId: "hr",
      allowedCallerUnitIds: ["finance"],
      sourceCatalog: { list: () => [invalidSource as WorkspaceAnalysisSourceDefinition] },
      requesterExists: async () => true,
      canDiscover: async () => true,
    });
    const response = await handler(request(validBody));
    assert.equal(response.status, 500);
  }
});

test("source RPC executes only through the owner and returns requested canonical fields", async () => {
  const calls: Array<{ requesterId: number; targetId: number; ownerUnitId: string; fields: readonly string[] }> = [];
  const handler = createWorkspaceAnalysisSourceRpcHandler({
    ownerUnitId: "hr",
    allowedCallerUnitIds: ["finance"],
    sourceCatalog: { list: () => [source] },
    requesterExists: async () => true,
    canDiscover: async () => true,
    executeSource: async (execution) => {
      calls.push({
        requesterId: execution.requesterId,
        targetId: execution.targetId,
        ownerUnitId: execution.ownerUnitId,
        fields: execution.fields,
      });
      return {
        sourceKey: execution.sourceKey,
        sourceVersion: execution.sourceVersion,
        rows: [{ employeeName: "张三" }],
        pageCount: 1,
        byteCount: 24,
      };
    },
  });

  const response = await handler(request(validExecuteBody));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ requesterId: 7, targetId: 12, ownerUnitId: "hr", fields: ["employeeName"] }]);
  assert.deepEqual(payload.rows, [{ employeeName: "张三" }]);
  const serialized = JSON.stringify(payload);
  for (const forbidden of ["adapter", "rowsPath", "fieldPaths", "pagination", "/api/modules"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("source RPC rejects extra fields and maps owner execution failures", async () => {
  const extraFieldHandler = createWorkspaceAnalysisSourceRpcHandler({
    ownerUnitId: "hr",
    allowedCallerUnitIds: ["finance"],
    sourceCatalog: { list: () => [source] },
    requesterExists: async () => true,
    canDiscover: async () => true,
    executeSource: async (execution) => ({
      sourceKey: execution.sourceKey,
      sourceVersion: execution.sourceVersion,
      rows: [{ employeeName: "张三", salary: 1 }],
      pageCount: 1,
      byteCount: 32,
    }),
  });
  assert.equal((await extraFieldHandler(request(validExecuteBody))).status, 502);

  const forbiddenHandler = createWorkspaceAnalysisSourceRpcHandler({
    ownerUnitId: "hr",
    allowedCallerUnitIds: ["finance"],
    sourceCatalog: { list: () => [source] },
    requesterExists: async () => true,
    canDiscover: async () => true,
    executeSource: async () => {
      const { WorkspaceAnalysisRuntimeError } = await import("./workspace-analysis-runtime");
      throw new WorkspaceAnalysisRuntimeError("source_forbidden", "无权限读取雇佣记录", "hr.employments");
    },
  });
  assert.equal((await forbiddenHandler(request(validExecuteBody))).status, 403);
});

test("remote source loader validates response identity and exact requested projection", async (t) => {
  let sentOperation: unknown;
  let sentBodyText = "";
  t.mock.method(globalThis, "fetch", async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    sentBodyText = String(init?.body);
    const sentBody = JSON.parse(sentBodyText) as Record<string, unknown>;
    sentOperation = sentBody.operation;
    return jsonResponse({
      schemaVersion: 1,
      kind: "workspace-analysis-source-result",
      ownerUnitId: "hr",
      targetType: "department",
      targetId: 12,
      sourceKey: "hr.employments",
      sourceVersion: 1,
      rows: [{ employeeName: "张三" }],
      pageCount: 1,
      byteCount: 24,
    });
  });
  const loaded = await loadRemoteWorkspaceAnalysisSource({
    ownerUnitId: "hr",
    callerUnitId: "finance",
    request: {
      requesterId: 7,
      targetType: "department",
      targetId: 12,
      ownerUnitId: "hr",
      sourceKey: "hr.employments",
      sourceVersion: 1,
      parameters: {},
      fields: ["employeeName"],
      limits: validExecuteBody.limits,
      signal: new AbortController().signal,
    },
  });

  assert.deepEqual(loaded.rows, [{ employeeName: "张三" }]);
  assert.equal(sentOperation, "execute");
  assert.equal(sentBodyText.includes("ownerUnitId"), false);
});

test("remote catalog and execution reject oversized bodies before JSON materialization", async (t) => {
  let cancellations = 0;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream<Uint8Array>({
    cancel() {
      cancellations += 1;
    },
  }), { headers: { "content-length": "999999999" } }));

  await assert.rejects(() => loadRemoteWorkspaceAnalysisSources({
    ownerUnitId: "hr",
    callerUnitId: "finance",
    requesterId: 7,
    targetType: "department",
    targetId: 12,
  }), (cause) => {
    assert.equal(cause instanceof WorkspaceInternalRpcError, true);
    assert.equal((cause as InstanceType<typeof WorkspaceInternalRpcError>).status, 413);
    return true;
  });
  assert.equal(cancellations, 1);

  await assert.rejects(() => loadRemoteWorkspaceAnalysisSource({
    ownerUnitId: "hr",
    callerUnitId: "finance",
    request: {
      requesterId: 7,
      targetType: "department",
      targetId: 12,
      ownerUnitId: "hr",
      sourceKey: "hr.employments",
      sourceVersion: 1,
      parameters: {},
      fields: ["employeeName"],
      limits: validExecuteBody.limits,
      signal: new AbortController().signal,
    },
  }), (cause) => {
    assert.equal((cause as { code?: string }).code, "source_limit_exceeded");
    return true;
  });
  assert.equal(cancellations, 2);
});

test("remote catalog keeps deploy identity separate from a legacy API module segment", async (t) => {
  let requestedPath = "";
  const capitalSource = {
    ...source,
    sourceKey: "capital-securities.companies",
    ownerModuleKey: "capitalSecurities",
    authorization: {
      ...source.authorization,
      resourceKey: "capitalSecurities.governance",
    },
    scopeBindings: { personal: { mode: "workspace" as const, description: "全公司数据。" } },
  } satisfies WorkspaceAnalysisSourceDefinition;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    requestedPath = new URL(String(url)).pathname;
    return jsonResponse({
      schemaVersion: 1,
      kind: "workspace-analysis-source-catalog",
      ownerUnitId: "capital-securities",
      targetType: "personal",
      targetId: 7,
      sources: [capitalSource],
    });
  });

  const sources = await loadRemoteWorkspaceAnalysisSources({
    ownerUnitId: "capital-securities",
    callerUnitId: "finance",
    apiModulePathSegment: "capitalSecurities",
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
  });

  assert.equal(sources[0]?.sourceKey, "capital-securities.companies");
  assert.match(requestedPath, /\/api\/modules\/capitalSecurities\/internal\/workspace-analysis-sources$/);
  await assert.rejects(() => loadRemoteWorkspaceAnalysisSources({
    ownerUnitId: "capital-securities",
    callerUnitId: "finance",
    apiModulePathSegment: "../capitalSecurities",
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
  }), /API 模块路径无效/);
});

async function withModuleRuntimeOverrides<T>(
  overrides: ModuleRuntimeOverrideMap,
  run: () => Promise<T>,
) {
  const previous = getDynamicModuleRuntimeOverrides();
  setDynamicModuleRuntimeOverrides(overrides);
  clearResourceRuntimeStateCache();
  try {
    return await run();
  } finally {
    setDynamicModuleRuntimeOverrides(previous);
    clearResourceRuntimeStateCache();
  }
}
