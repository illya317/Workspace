import assert from "node:assert/strict";
import test from "node:test";

import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceSourcesOperationalAnalysisDefinition,
} from "../workspace-analysis-source-contract";
import { buildWorkspaceAnalysisExecutionPlan } from "./workspace-analysis-execution-plan";
import { createWorkspaceAnalysisSourceDirectory } from "./workspace-analysis-source-directory";

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
  fields: [
    field("date", "日期", "date", ["year", "month"], true, ["count"]),
    field("productName", "产品", "text", ["contains"], true, ["count", "distinctCount"]),
    field("amount", "金额", "currency", [], false, ["count", "sum", "average"]),
  ],
  limits: { maxRows: 200, maxGroups: 100, maxPageSize: 100, maxPages: 2, maxBytes: 1_048_576, timeoutMs: 5_000 },
} as const satisfies WorkspaceAnalysisSourceDefinition;

const definition = {
  schemaVersion: 3,
  dataset: "workspace.sources",
  sources: [{ key: "shipments", sourceKey: "finance.shipments", sourceVersion: 1 }],
  filters: [{ key: "year", label: "年份", source: "shipments", field: "date", kind: "year", defaultValue: "2026" }],
  blocks: [
    { key: "totals", kind: "metrics", source: "shipments", metrics: [{ key: "amount", label: "金额", operation: "sum", field: "amount" }] },
    { key: "trend", kind: "chart", source: "shipments", title: "趋势", dimension: { field: "date", bucket: "month" }, metrics: [{ key: "amount", label: "金额", operation: "sum", field: "amount" }] },
    { key: "details", kind: "table", source: "shipments", title: "明细", columns: [{ key: "product", label: "产品", field: "productName" }] },
  ],
} as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;

test("builds a deterministic plan only from requester-and-target authorized sources", async () => {
  const directory = createWorkspaceAnalysisSourceDirectory([{
    ownerUnitId: "finance",
    listAvailableSources: async () => [source],
    loadSource: emptyLoader,
  }]);
  const authorized = (await directory.list({ requesterId: 7, targetType: "personal", targetId: 7 })).authorizedSources;
  const result = buildWorkspaceAnalysisExecutionPlan({ authorizedSources: authorized, definition });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.scope, { targetType: "personal", targetId: 7 });
  assert.equal(result.plan.requesterId, 7);
  assert.equal(result.plan.sources[0]?.ownerUnitId, "finance");
  assert.deepEqual(result.plan.sources[0]?.fields, ["amount", "date", "productName"]);
  assert.equal(result.plan.sources[0]?.limits.maxGroups, 60);
  assert.equal(result.plan.filterValues.year, "2026");
  assert.equal(JSON.stringify(result.plan.definition).includes("/api/"), false);
});

test("does not accept a caller-constructed full catalog as an authorization boundary", () => {
  const result = buildWorkspaceAnalysisExecutionPlan({
    authorizedSources: { context: { requesterId: 7, targetType: "personal", targetId: 7 }, get: () => source } as never,
    definition,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0]?.code, "invalid_context");
});

test("rejects source identities absent from the scoped discovery result", async () => {
  const authorized = (await createWorkspaceAnalysisSourceDirectory([{
    ownerUnitId: "finance",
    listAvailableSources: async () => [],
    loadSource: emptyLoader,
  }]).list({ requesterId: 7, targetType: "personal", targetId: 7 })).authorizedSources;
  const result = buildWorkspaceAnalysisExecutionPlan({ authorizedSources: authorized, definition });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0]?.code, "source_not_found");
});

test("validates runtime filter names and values before loading a source", async () => {
  const authorized = (await createWorkspaceAnalysisSourceDirectory([{
    ownerUnitId: "finance",
    listAvailableSources: async () => [source],
    loadSource: emptyLoader,
  }]).list({ requesterId: 7, targetType: "personal", targetId: 7 })).authorizedSources;
  const result = buildWorkspaceAnalysisExecutionPlan({
    authorizedSources: authorized,
    definition,
    filterValues: { year: "26", undeclared: "value" },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.issues.map((issue) => issue.code), ["filter_unknown", "filter_value_invalid"]);
});

function field(
  key: string,
  label: string,
  kind: WorkspaceAnalysisSourceDefinition["fields"][number]["kind"],
  filterOperators: WorkspaceAnalysisSourceDefinition["fields"][number]["capabilities"]["filterOperators"],
  groupable: boolean,
  aggregateOperations: WorkspaceAnalysisSourceDefinition["fields"][number]["capabilities"]["aggregateOperations"],
) {
  return {
    key,
    label,
    description: `${label}测试字段。`,
    kind,
    sensitivity: "internal" as const,
    exportPolicy: "allowed" as const,
    capabilities: { displayable: true, filterOperators, groupable, aggregateOperations },
  };
}

async function emptyLoader(request: Parameters<NonNullable<import("./workspace-analysis-source-directory").WorkspaceAnalysisSourceProvider["loadSource"]>>[0]) {
  return { sourceKey: request.sourceKey, sourceVersion: request.sourceVersion, rows: [], pageCount: 1, byteCount: 2 };
}
