import assert from "node:assert/strict";
import test from "node:test";

import { clearResourceRuntimeStateCache } from "../effective-module-registry";
import {
  getDynamicModuleRuntimeOverrides,
  setDynamicModuleRuntimeOverrides,
  type ModuleRuntimeOverrideMap,
} from "../module-overrides";
import type { WorkspaceAnalysisSourceDefinition } from "../workspace-analysis-source-contract";
import { createWorkspaceAnalysisSourceCatalog } from "./workspace-analysis-source-registry";
import {
  runRegisteredWorkspaceAnalysisSource,
  type WorkspaceAnalysisRawSourcePageReader,
} from "./workspace-analysis-source-executor";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "./workspace-analysis-runtime";

const definition = {
  sourceKey: "finance.shipments",
  version: 1,
  label: "发货事实",
  description: "按目标用户归属收窄的发货事实。",
  ownerModuleKey: "finance",
  authorization: {
    resourceKey: "finance.operationalAnalytics",
    requiredActions: ["read"],
    projection: "default",
    enforcement: "serviceDelegated",
  },
  scopeBindings: { personal: { mode: "target", description: "强制绑定目标用户。" } },
  parameters: [
    { key: "dateFrom", label: "开始日期", description: "开始日期。", kind: "date", requiredWith: ["dateTo"] },
    { key: "dateTo", label: "结束日期", description: "结束日期。", kind: "date", requiredWith: ["dateFrom"] },
  ],
  parameterConstraints: [{
    kind: "orderedDates",
    from: "dateFrom",
    to: "dateTo",
    description: "结束日期不能早于开始日期",
  }],
  fields: [
    {
      key: "date",
      label: "日期",
      description: "发货日期。",
      kind: "date",
      sensitivity: "internal",
      exportPolicy: "allowed",
      capabilities: { displayable: true, filterOperators: ["year", "month"], groupable: true, aggregateOperations: ["count"] },
    },
    {
      key: "amount",
      label: "金额",
      description: "发货金额。",
      kind: "currency",
      sensitivity: "restricted",
      exportPolicy: "forbidden",
      capabilities: { displayable: true, filterOperators: [], groupable: false, aggregateOperations: ["count", "sum"] },
    },
  ],
  limits: { maxRows: 4, maxGroups: 20, maxPageSize: 2, maxPages: 2, maxBytes: 1_024, timeoutMs: 1_000 },
} as const satisfies WorkspaceAnalysisSourceDefinition;

const registration = {
  definition,
  adapter: {
    kind: "workspaceGet",
    path: ["", "api", "modules", "finance", "cost", "operational-analytics", "shipments"].join("/"),
    rowsPath: "data",
    fieldPaths: { date: "occurredAt", amount: "values.amount" },
    scopeQuery: { personal: { scopeType: "scopeType", scopeId: "scopeId" } },
    parameterQuery: { dateFrom: "dateFrom", dateTo: "dateTo" },
    pagination: { pageParam: "page", pageSizeParam: "pageSize", totalPath: "pagination.total", pageSize: 2, maxPages: 2 },
  },
} as const;

const catalog = createWorkspaceAnalysisSourceCatalog([registration]);

test("owner-side execution reauthorizes, paginates, and returns canonical requested fields only", async () => {
  const raw = [
    { occurredAt: new Date("2026-01-01T00:00:00.000Z"), values: { amount: 10 }, rawSecret: "hidden" },
    { occurredAt: "2026-01-02", values: { amount: 20 }, rawSecret: "hidden" },
    { occurredAt: "2026-01-03", values: { amount: 30 }, rawSecret: "hidden" },
  ];
  const scopes: Array<[number, string, number]> = [];
  const pages: number[] = [];
  const result = await runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "finance",
    sourceCatalog: catalog,
    request: request(),
    canExecute: ({ requesterId, targetType, targetId }) => {
      scopes.push([requesterId, targetType, targetId]);
      return true;
    },
    loadPage: async ({ page, pageSize, targetId, parameters }) => {
      assert.equal(targetId, 7);
      assert.deepEqual(parameters, { dateFrom: "2026-01-01", dateTo: "2026-12-31" });
      pages.push(page);
      return { rows: raw.slice((page - 1) * pageSize, page * pageSize), totalRows: raw.length };
    },
  });

  assert.deepEqual(scopes, [[7, "personal", 7]]);
  assert.deepEqual(pages, [1, 2]);
  assert.deepEqual(result.rows, [
    { amount: 10, date: "2026-01-01T00:00:00.000Z" },
    { amount: 20, date: "2026-01-02" },
    { amount: 30, date: "2026-01-03" },
  ]);
  assert.equal(JSON.stringify(result).includes("rawSecret"), false);
  assert.equal(JSON.stringify(result).includes("hidden"), false);
  assert.equal(result.pageCount, 2);
  assert.ok(result.byteCount > 0 && result.byteCount <= definition.limits.maxBytes);
});

test("owner-side execution rejects stale authorization and authorization outages", async () => {
  for (const [decision, code] of [
    [async () => false, "source_forbidden"],
    [async () => { throw new Error("permission backend unavailable"); }, "source_unavailable"],
  ] as const) {
    await assert.rejects(() => runRegisteredWorkspaceAnalysisSource({
      ownerUnitId: "finance",
      sourceCatalog: catalog,
      request: request(),
      canExecute: decision,
      loadPage: emptyPage,
    }), runtimeFailure(code));
  }
});

test("owner-side execution rejects a disabled effective resource before root-like authorization", async () => {
  await withModuleRuntimeOverrides({ finance: { enabled: false } }, async () => {
    let authorizationCalls = 0;
    let pageCalls = 0;
    await assert.rejects(() => runRegisteredWorkspaceAnalysisSource({
      ownerUnitId: "finance",
      sourceCatalog: catalog,
      request: request(),
      canExecute: async () => {
        authorizationCalls += 1;
        return true;
      },
      loadPage: async () => {
        pageCalls += 1;
        return { rows: [], totalRows: 0 };
      },
    }), runtimeFailure("source_forbidden"));
    assert.equal(authorizationCalls, 0);
    assert.equal(pageCalls, 0);
  });
});

test("owner-side execution rejects caller-controlled owner, scope, field, budget, and parameter drift", async () => {
  const cases: Array<[Partial<WorkspaceAnalysisSourceLoadRequest>, string]> = [
    [{ ownerUnitId: "hr" }, "source_response_invalid"],
    [{ targetType: "department" }, "source_forbidden"],
    [{ fields: ["notRegistered"] }, "source_forbidden"],
    [{ limits: { ...request().limits, maxRows: 5 } }, "source_response_invalid"],
    [{ limits: { ...request().limits, maxGroups: 21 } }, "source_response_invalid"],
    [{ limits: { ...request().limits, pageSize: 3 } }, "source_response_invalid"],
    [{ limits: { ...request().limits, maxPages: 3 } }, "source_response_invalid"],
    [{ limits: { ...request().limits, maxBytes: 1_025 } }, "source_response_invalid"],
    [{ limits: { ...request().limits, timeoutMs: 1_001 } }, "source_response_invalid"],
    [{ parameters: { dateFrom: "2026-12-31", dateTo: "2026-01-01" } }, "source_response_invalid"],
  ];
  for (const [override, code] of cases) {
    await assert.rejects(() => runRegisteredWorkspaceAnalysisSource({
      ownerUnitId: "finance",
      sourceCatalog: catalog,
      request: { ...request(), ...override },
      canExecute: async () => true,
      loadPage: emptyPage,
    }), runtimeFailure(code));
  }
});

test("owner-side pagination fails explicitly instead of truncating or accepting drift", async (t) => {
  await t.test("row ceiling", async () => {
    await assert.rejects(() => execute(async () => ({ rows: [], totalRows: 5 })), runtimeFailure("source_limit_exceeded"));
  });
  await t.test("total drift", async () => {
    await assert.rejects(() => execute(async ({ page }) => ({
      rows: page === 1
        ? [{ occurredAt: "2026-01-01", values: { amount: 1 } }, { occurredAt: "2026-01-02", values: { amount: 2 } }]
        : [{ occurredAt: "2026-01-03", values: { amount: 3 } }],
      totalRows: page === 1 ? 3 : 4,
    })), runtimeFailure("source_response_invalid"));
  });
  await t.test("incomplete page", async () => {
    await assert.rejects(() => execute(async () => ({
      rows: [{ occurredAt: "2026-01-01", values: { amount: 1 } }],
      totalRows: 3,
    })), runtimeFailure("source_response_invalid"));
  });
  await t.test("page ceiling", async () => {
    await assert.rejects(() => runRegisteredWorkspaceAnalysisSource({
      ownerUnitId: "finance",
      sourceCatalog: catalog,
      request: request({ limits: { ...request().limits, pageSize: 1 } }),
      canExecute: async () => true,
      loadPage: async ({ page }) => ({
        rows: [{ occurredAt: `2026-01-0${page}`, values: { amount: page } }],
        totalRows: 3,
      }),
    }), runtimeFailure("source_limit_exceeded"));
  });
  await t.test("byte ceiling", async () => {
    await assert.rejects(() => runRegisteredWorkspaceAnalysisSource({
      ownerUnitId: "finance",
      sourceCatalog: catalog,
      request: request({ limits: { ...request().limits, maxBytes: 1 } }),
      canExecute: async () => true,
      loadPage: emptyPage,
    }), runtimeFailure("source_limit_exceeded"));
  });
});

test("owner-side execution aborts a hung domain reader at the caller budget", async () => {
  await assert.rejects(() => runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "finance",
    sourceCatalog: catalog,
    request: request({ limits: { ...request().limits, timeoutMs: 100 } }),
    canExecute: async () => true,
    loadPage: async () => new Promise(() => undefined),
  }), runtimeFailure("timeout"));
});

test("owner-side execution rejects field type drift before crossing a unit boundary", async () => {
  await assert.rejects(() => execute(async () => ({
    rows: [{ occurredAt: "2026-01-01", values: { amount: "10" } }],
    totalRows: 1,
  })), runtimeFailure("source_response_invalid"));
});

function request(override: Partial<WorkspaceAnalysisSourceLoadRequest> = {}): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
    ownerUnitId: "finance",
    sourceKey: "finance.shipments",
    sourceVersion: 1,
    parameters: { dateFrom: "2026-01-01", dateTo: "2026-12-31" },
    fields: ["amount", "date"],
    limits: {
      maxRows: 4,
      maxGroups: 20,
      pageSize: 2,
      maxPages: 2,
      maxBytes: 1_024,
      timeoutMs: 1_000,
    },
    signal: new AbortController().signal,
    ...override,
  };
}

function execute(loadPage: WorkspaceAnalysisRawSourcePageReader) {
  return runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "finance",
    sourceCatalog: catalog,
    request: request(),
    canExecute: async () => true,
    loadPage,
  });
}

async function emptyPage() {
  return { rows: [], totalRows: 0 };
}

function runtimeFailure(code: string) {
  return (error: unknown) => error instanceof WorkspaceAnalysisRuntimeError && error.code === code;
}

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
