import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceSourcesOperationalAnalysisDefinition,
} from "@workspace/platform/workspace-analysis-source-contract";
import { createWorkspaceAnalysisSourceDirectory } from "@workspace/platform/server/workspace-analysis-source-directory";
import { WorkspaceAnalysisRuntimeError } from "@workspace/platform/server/workspace-analysis-runtime";

mock.module("server-only", { namedExports: {} } as never);

let readAllowed = true;
let apiUseAllowed = true;
let defaultBuiltDirectory: ReturnType<typeof createWorkspaceAnalysisSourceDirectory> | null = null;
const directoryBuildInputs: unknown[] = [];
mock.module("./operational-analytics", {
  namedExports: {
    canReadOperationalAnalytics: async () => readAllowed,
    canUseOperationalAnalyticsApi: async () => apiUseAllowed,
  },
} as never);
mock.module("./operational-analysis-source-directory", {
  namedExports: {
    OPERATIONAL_ANALYSIS_RUNTIME_PROVIDER_TIMEOUT_MS: 10_000,
    isFinanceOperationalAnalysisRemoteOwnerUnitId: (value: string) => [
      "administration", "capital-securities", "external", "hr", "inventory", "library", "production", "work",
    ].includes(value),
    buildFinanceOperationalAnalysisSourceDirectory: (input: unknown) => {
      directoryBuildInputs.push(input);
      if (defaultBuiltDirectory) return defaultBuiltDirectory;
      throw new Error("test must inject a directory");
    },
  },
} as never);
mock.module("@workspace/platform/service-result", {
  namedExports: {
    serviceOk: (data: unknown) => ({ ok: true, data }),
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
  },
} as never);

const {
  compileAuthorizedFinanceWorkspaceAnalysisDefinition,
  runFinanceWorkspaceAnalysisRuntime,
} = await import("./workspace-analysis-runtime");

const source = {
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
  parameters: [],
  fields: [{
    key: "amount",
    label: "金额",
    description: "发货金额。",
    kind: "currency",
    sensitivity: "confidential",
    exportPolicy: "allowed",
    capabilities: { displayable: true, filterOperators: [], groupable: false, aggregateOperations: ["count", "sum"] },
  }],
  limits: { maxRows: 10, maxGroups: 10, maxPageSize: 10, maxPages: 1, maxBytes: 1_024, timeoutMs: 1_000 },
} as const satisfies WorkspaceAnalysisSourceDefinition;

const definition = {
  schemaVersion: 3,
  dataset: "workspace.sources",
  sources: [{ key: "shipments", sourceKey: "finance.shipments", sourceVersion: 1 }],
  filters: [],
  blocks: [{
    key: "total",
    kind: "metrics",
    source: "shipments",
    metrics: [{ key: "amount", label: "发货金额", operation: "sum", field: "amount", format: "currency" }],
  }],
} as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;

test("Finance runtime binds discovery, owner execution, aggregation, and safe audit metadata", async () => {
  readAllowed = true;
  apiUseAllowed = true;
  const audits: unknown[] = [];
  const result = await runFinanceWorkspaceAnalysisRuntime({
    userId: 7,
    scope: { scopeType: "personal", scopeId: 7 },
    definition,
    directory: directory(async (request) => ({
      sourceKey: request.sourceKey,
      sourceVersion: request.sourceVersion,
      rows: [{ amount: 10 }, { amount: 20 }],
      pageCount: 1,
      byteCount: 30,
    })),
    onAudit: (audit) => { audits.push(audit); },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const block = result.data.data.blocks[0];
  assert.equal(block?.kind === "metrics" ? block.metrics[0]?.value : null, 30);
  assert.equal(audits.length, 1);
  assert.equal(JSON.stringify(audits).includes("amount"), false);
});

test("Finance runtime requires apiUse for API-key execution before discovery", async () => {
  readAllowed = true;
  apiUseAllowed = false;
  let directoryCalls = 0;
  const injected = {
    list: async () => {
      directoryCalls += 1;
      return directory(async () => ({ sourceKey: "finance.shipments", sourceVersion: 1, rows: [], pageCount: 1, byteCount: 2 }))
        .list({ requesterId: 7, targetType: "personal", targetId: 7 });
    },
  };
  const result = await runFinanceWorkspaceAnalysisRuntime({
    userId: 7,
    scope: { scopeType: "personal", scopeId: 7 },
    definition,
    viaApiKey: true,
    directory: injected,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
  assert.equal(directoryCalls, 0);
  apiUseAllowed = true;
});

test("compile-only validation does not load rows and request filter errors are 400", async () => {
  let loadCalls = 0;
  const injected = directory(async () => {
    loadCalls += 1;
    return { sourceKey: "finance.shipments", sourceVersion: 1, rows: [], pageCount: 1, byteCount: 2 };
  });
  const compiled = await compileAuthorizedFinanceWorkspaceAnalysisDefinition({
    userId: 7,
    scope: { scopeType: "personal", scopeId: 7 },
    definition,
    directory: injected,
  });
  assert.equal(compiled.ok, true);
  assert.equal(loadCalls, 0);

  const invalidFilter = await runFinanceWorkspaceAnalysisRuntime({
    userId: 7,
    scope: { scopeType: "personal", scopeId: 7 },
    definition,
    filterValues: { unknown: "x" },
    directory: injected,
  });
  assert.equal(invalidFilter.ok, false);
  if (!invalidFilter.ok) assert.equal(invalidFilter.status, 400);
  assert.equal(loadCalls, 0);
});

test("Finance runtime fails closed when owner authorization is revoked after discovery", async () => {
  const result = await runFinanceWorkspaceAnalysisRuntime({
    userId: 7,
    scope: { scopeType: "personal", scopeId: 7 },
    definition,
    directory: directory(async () => {
      throw new WorkspaceAnalysisRuntimeError("source_forbidden", "无权限读取发货事实", "finance.shipments");
    }),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
});

test("Finance runtime distinguishes an unavailable referenced provider from an invalid source", async (t) => {
  const hrDefinition = {
    schemaVersion: 3,
    dataset: "workspace.sources",
    sources: [{ key: "employments", sourceKey: "hr.employments", sourceVersion: 1 }],
    filters: [],
    blocks: [{
      key: "count",
      kind: "metrics",
      source: "employments",
      metrics: [{ key: "count", label: "人数", operation: "count" }],
    }],
  } as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;

  await t.test("unavailable provider is retryable", async () => {
    const unavailableDirectory = createWorkspaceAnalysisSourceDirectory([{
      ownerUnitId: "hr",
      supportedTargetTypes: ["department"],
      listAvailableSources: async () => { throw new Error("HR unavailable"); },
    }]);
    const result = await runFinanceWorkspaceAnalysisRuntime({
      userId: 7,
      scope: { scopeType: "department", scopeId: 12 },
      definition: hrDefinition,
      directory: unavailableDirectory,
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 503);
  });

  await t.test("available provider with an unknown source remains a template conflict", async () => {
    const availableDirectory = createWorkspaceAnalysisSourceDirectory([{
      ownerUnitId: "hr",
      supportedTargetTypes: ["department"],
      listAvailableSources: async () => [],
    }]);
    const result = await runFinanceWorkspaceAnalysisRuntime({
      userId: 7,
      scope: { scopeType: "department", scopeId: 12 },
      definition: hrDefinition,
      directory: availableDirectory,
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 409);
  });
});

test("runtime discovery asks only the source owners referenced by a valid template", async () => {
  const hrSource = {
    ...source,
    sourceKey: "hr.employments",
    ownerModuleKey: "hr",
    scopeBindings: { department: { mode: "target" as const, description: "强制绑定目标部门。" } },
  } satisfies WorkspaceAnalysisSourceDefinition;
  const hrDefinition = {
    schemaVersion: 3,
    dataset: "workspace.sources",
    sources: [{ key: "employments", sourceKey: "hr.employments", sourceVersion: 1 }],
    filters: [],
    blocks: [{
      key: "count",
      kind: "metrics",
      source: "employments",
      metrics: [{ key: "count", label: "人数", operation: "count" }],
    }],
  } as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;
  defaultBuiltDirectory = createWorkspaceAnalysisSourceDirectory([{
    ownerUnitId: "hr",
    listAvailableSources: async () => [hrSource],
    loadSource: async () => ({
      sourceKey: "hr.employments",
      sourceVersion: 1,
      rows: [],
      pageCount: 1,
      byteCount: 2,
    }),
  }]);
  directoryBuildInputs.length = 0;
  try {
    const result = await compileAuthorizedFinanceWorkspaceAnalysisDefinition({
      userId: 7,
      scope: { scopeType: "department", scopeId: 12 },
      definition: hrDefinition,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(directoryBuildInputs, [{
      remoteOwnerUnitIds: ["hr"],
      remoteProviderTimeoutMs: 10_000,
    }]);
  } finally {
    defaultBuiltDirectory = null;
  }
});

function directory(
  loadSource: NonNullable<import("@workspace/platform/server/workspace-analysis-source-directory").WorkspaceAnalysisSourceProvider["loadSource"]>,
) {
  return createWorkspaceAnalysisSourceDirectory([{
    ownerUnitId: "finance",
    listAvailableSources: async () => [source],
    loadSource,
  }]);
}
