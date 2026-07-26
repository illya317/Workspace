import assert from "node:assert/strict";
import test from "node:test";

import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceSourcesOperationalAnalysisDefinition,
} from "../workspace-analysis-source-contract";
import type { WorkspaceAnalysisSourceRegistration } from "./workspace-analysis-source-registry";
import { compileWorkspaceAnalysisDefinition } from "./workspace-analysis-definition-compiler";

const TEST_SOURCE_PATH = ["", "api", "modules", "finance", "cost", "facts"].join("/");

const definition = {
  sourceKey: "finance.shipments",
  version: 1,
  label: "发货事实",
  description: "以一条发货事实为粒度。",
  ownerModuleKey: "finance",
  authorization: {
    resourceKey: "finance.operationalAnalytics",
    requiredActions: ["read"],
    projection: "default",
    enforcement: "serviceDelegated",
  },
  scopeBindings: {
    personal: { mode: "target", description: "强制绑定目标用户。" },
  },
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
      label: "发货日期",
      description: "发货事实日期。",
      kind: "date",
      sensitivity: "internal",
      exportPolicy: "allowed",
      capabilities: { displayable: true, filterOperators: ["year", "month", "range"], groupable: true, aggregateOperations: ["count"] },
    },
    {
      key: "productName",
      label: "产品",
      description: "产品名称。",
      kind: "text",
      sensitivity: "internal",
      exportPolicy: "allowed",
      capabilities: { displayable: true, filterOperators: ["equals", "contains"], groupable: true, aggregateOperations: ["count", "distinctCount"] },
    },
    {
      key: "amount",
      label: "发货金额",
      description: "含税发货金额。",
      kind: "currency",
      sensitivity: "confidential",
      exportPolicy: "allowed",
      capabilities: { displayable: true, filterOperators: ["equals", "range"], groupable: false, aggregateOperations: ["count", "sum", "average"] },
    },
    {
      key: "secretMargin",
      label: "内部边际",
      description: "尚无轻代码授权模型的受限字段。",
      kind: "percent",
      sensitivity: "restricted",
      exportPolicy: "forbidden",
      capabilities: { displayable: true, filterOperators: [], groupable: false, aggregateOperations: ["sum"] },
    },
    {
      key: "rawMarker",
      label: "内部标记",
      description: "不能直接展示的内部字段。",
      kind: "text",
      sensitivity: "internal",
      exportPolicy: "forbidden",
      capabilities: { displayable: false, filterOperators: [], groupable: false, aggregateOperations: ["count"] },
    },
  ],
  limits: { maxRows: 200, maxGroups: 20, maxPageSize: 100, maxPages: 2, maxBytes: 1_048_576, timeoutMs: 5_000 },
} as const satisfies WorkspaceAnalysisSourceDefinition;

const registration = {
  definition,
  adapter: {
    kind: "workspaceGet",
    path: TEST_SOURCE_PATH,
    rowsPath: "data",
    fieldPaths: { date: "date", productName: "productName", amount: "amount", secretMargin: "secretMargin", rawMarker: "rawMarker" },
    scopeQuery: { personal: { scopeId: "scopeId" } },
    parameterQuery: { dateFrom: "dateFrom", dateTo: "dateTo" },
    pagination: { pageParam: "page", pageSizeParam: "pageSize", totalPath: "pagination.total", pageSize: 100, maxPages: 2 },
  },
} as const satisfies WorkspaceAnalysisSourceRegistration;

const sourceCatalog = {
  get(sourceKey: string, version: number) {
    return sourceKey === definition.sourceKey && version === definition.version ? definition : null;
  },
};

const validTemplate = {
  schemaVersion: 3,
  dataset: "workspace.sources",
  sources: [{
    key: "shipments",
    sourceKey: "finance.shipments",
    sourceVersion: 1,
    parameters: { dateFrom: "2026-01-01", dateTo: "2026-12-31" },
  }],
  filters: [
    { key: "product", label: "产品", source: "shipments", field: "productName", kind: "search" },
    { key: "year", label: "年份", source: "shipments", field: "date", kind: "year", defaultValue: "2026" },
  ],
  blocks: [
    { key: "totals", kind: "metrics", source: "shipments", metrics: [{ key: "amount", label: "发货金额", operation: "sum", field: "amount", format: "currency" }] },
    { key: "trend", kind: "chart", source: "shipments", title: "发货金额趋势", dimension: { field: "date", bucket: "month" }, metrics: [{ key: "amount", label: "发货金额", operation: "sum", field: "amount", format: "currency" }], comparison: "both", limit: 12 },
    { key: "details", kind: "table", source: "shipments", title: "发货明细", columns: [{ key: "date", label: "日期", field: "date", format: "date" }, { key: "amount", label: "金额", field: "amount", format: "currency" }], limit: 100 },
  ],
} as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;

test("compiles a v3 template against an exact registered source version", () => {
  const result = compileWorkspaceAnalysisDefinition({ definition: validTemplate, scopeType: "personal", sourceCatalog });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.resolvedSources.get("shipments"), definition);
  assert.equal(JSON.stringify(result.definition).includes("/api/"), false);
  assert.equal(JSON.stringify(result.definition).includes("rowsPath"), false);
});

test("strict v3 shape rejects internal transport details at every source", () => {
  for (const injected of [
    { path: registration.adapter.path },
    { rowsPath: registration.adapter.rowsPath },
    { query: { scopeId: 1 } },
    { pagination: { pageSize: 100 } },
    { sql: "select * from shipment" },
  ]) {
    const result = compileWorkspaceAnalysisDefinition({
      definition: { ...validTemplate, sources: [{ ...validTemplate.sources[0], ...injected }] },
      scopeType: "personal",
      sourceCatalog,
    });
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.issues[0]?.code, "invalid_shape");
    assert.equal(JSON.stringify(result.issues).includes(registration.adapter.path), false);
  }
});

test("fails closed for unknown versions and unsupported scopes", () => {
  const unknown = compileWorkspaceAnalysisDefinition({
    definition: { ...validTemplate, sources: [{ ...validTemplate.sources[0], sourceVersion: 2 }] },
    scopeType: "personal",
    sourceCatalog,
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.issues[0]?.code, "source_not_found");

  const wrongScope = compileWorkspaceAnalysisDefinition({ definition: validTemplate, scopeType: "department", sourceCatalog });
  assert.equal(wrongScope.ok, false);
  if (!wrongScope.ok) assert.ok(wrongScope.issues.some((issue) => issue.code === "source_scope_unsupported"));
});

test("validates registered parameter names, types, dates, and required pairs", () => {
  const cases = [
    [{ dateFrom: "2026-01-01" }, "parameter_required"],
    [{ dateFrom: "2026-02-30", dateTo: "2026-12-31" }, "parameter_type_invalid"],
    [{ dateFrom: 20260101, dateTo: "2026-12-31" }, "parameter_type_invalid"],
    [{ dateFrom: "2026-01-01", dateTo: "2026-12-31", departmentId: 1 }, "parameter_unknown"],
  ] as const;
  for (const [parameters, expectedCode] of cases) {
    const result = compileWorkspaceAnalysisDefinition({
      definition: { ...validTemplate, sources: [{ ...validTemplate.sources[0], parameters }] },
      scopeType: "personal",
      sourceCatalog,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(
      result.issues.some((issue) => issue.code === expectedCode),
      `${expectedCode}: ${JSON.stringify(result.issues)}`,
    );
  }
});

test("validates registered cross-parameter date ordering before execution", () => {
  const result = compileWorkspaceAnalysisDefinition({
    definition: {
      ...validTemplate,
      sources: [{
        ...validTemplate.sources[0],
        parameters: { dateFrom: "2026-12-31", dateTo: "2026-01-01" },
      }],
    },
    scopeType: "personal",
    sourceCatalog,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === "parameter_relation_invalid"));
});

test("validates field filter, aggregate, grouping, display, and format capabilities", () => {
  const invalidBlocks = [
    [{ key: "bad", kind: "metrics", source: "shipments", metrics: [{ key: "bad", label: "错误", operation: "sum", field: "productName" }] }, "aggregate_not_allowed"],
    [{ key: "bad", kind: "chart", source: "shipments", title: "错误", dimension: { field: "amount" }, metrics: [{ key: "count", label: "数量", operation: "count" }] }, "field_not_groupable"],
    [{ key: "bad", kind: "table", source: "shipments", title: "错误", columns: [{ key: "raw", label: "内部", field: "rawMarker" }] }, "field_not_displayable"],
    [{ key: "bad", kind: "table", source: "shipments", title: "错误", columns: [{ key: "date", label: "日期", field: "date", format: "currency" }] }, "format_not_allowed"],
    [{ key: "bad", kind: "metrics", source: "shipments", metrics: [{ key: "amount", label: "发货金额", operation: "sum", field: "amount", format: "percent" }] }, "format_not_allowed"],
  ] as const;
  for (const [block, expectedCode] of invalidBlocks) {
    const result = compileWorkspaceAnalysisDefinition({ definition: { ...validTemplate, blocks: [block] }, scopeType: "personal", sourceCatalog });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(
      result.issues.some((issue) => issue.code === expectedCode),
      `${expectedCode}: ${JSON.stringify(result.issues)}`,
    );
  }

  const invalidFilter = compileWorkspaceAnalysisDefinition({
    definition: { ...validTemplate, filters: [{ key: "bad", label: "错误", source: "shipments", field: "amount", kind: "search" }] },
    scopeType: "personal",
    sourceCatalog,
  });
  assert.equal(invalidFilter.ok, false);
  if (!invalidFilter.ok) assert.ok(invalidFilter.issues.some((issue) => issue.code === "filter_not_allowed"));

  const restrictedButAuthorized = compileWorkspaceAnalysisDefinition({
    definition: {
      ...validTemplate,
      filters: [],
      blocks: [{
        key: "margin",
        kind: "metrics",
        source: "shipments",
        metrics: [{ key: "margin", label: "内部边际", operation: "sum", field: "secretMargin", format: "percent" }],
      }],
    },
    scopeType: "personal",
    sourceCatalog,
  });
  assert.equal(restrictedButAuthorized.ok, true);
});

test("enforces source row/group budgets and rejects unused source aliases", () => {
  for (const blocks of [
    [{ key: "chart", kind: "chart", source: "shipments", title: "过大", dimension: { field: "date", bucket: "month" }, metrics: [{ key: "count", label: "数量", operation: "count" }], limit: 21 }],
    [{ key: "table", kind: "table", source: "shipments", title: "过大", columns: [{ key: "date", label: "日期", field: "date" }], limit: 201 }],
  ] as const) {
    const result = compileWorkspaceAnalysisDefinition({ definition: { ...validTemplate, filters: [], blocks }, scopeType: "personal", sourceCatalog });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === "limit_exceeded"));
  }

  const unused = compileWorkspaceAnalysisDefinition({
    definition: { ...validTemplate, filters: [], blocks: [{ key: "help", kind: "note", content: "说明" }] },
    scopeType: "personal",
    sourceCatalog,
  });
  assert.equal(unused.ok, false);
  if (!unused.ok) assert.ok(unused.issues.some((issue) => issue.code === "source_unused"));
});
