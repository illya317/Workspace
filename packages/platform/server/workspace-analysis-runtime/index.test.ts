import assert from "node:assert/strict";
import test from "node:test";

import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceSourcesOperationalAnalysisDefinition,
} from "../../workspace-analysis-source-contract";
import {
  buildWorkspaceAnalysisExecutionPlan,
  type WorkspaceAnalysisExecutionPlan,
} from "../workspace-analysis-execution-plan";
import { createWorkspaceAnalysisSourceDirectory } from "../workspace-analysis-source-directory";
import {
  countChartBlock,
  twoSourceCountDefinition,
} from "./test-fixtures";
import {
  runWorkspaceAnalysisExecutionPlan,
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisRuntimeAudit,
  type WorkspaceAnalysisSourceLoader,
} from "./index";

const source = sourceDefinition("finance.shipments", {
  maxRows: 6,
  maxGroups: 60,
  maxPageSize: 2,
  maxPages: 3,
  maxBytes: 1_048_576,
  timeoutMs: 5_000,
});

const definition = {
  schemaVersion: 3,
  dataset: "workspace.sources",
  layout: "stack",
  sources: [{ key: "shipments", sourceKey: "finance.shipments", sourceVersion: 1 }],
  filters: [
    { key: "year", label: "年份", source: "shipments", field: "date", kind: "year", defaultValue: "2026" },
    { key: "product", label: "产品", source: "shipments", field: "productName", kind: "search" },
  ],
  blocks: [
    { key: "totals", kind: "metrics", source: "shipments", metrics: [{ key: "amount", label: "金额", operation: "sum", field: "amount" }] },
    {
      key: "trend",
      kind: "chart",
      source: "shipments",
      title: "月度趋势",
      dimension: { field: "date", label: "月份", bucket: "month" },
      metrics: [{ key: "amount", label: "金额", operation: "sum", field: "amount", format: "currency" }],
      comparison: "both",
      limit: 6,
    },
    {
      key: "details",
      kind: "table",
      source: "shipments",
      title: "发货明细",
      columns: [
        { key: "product", label: "产品", field: "productName" },
        { key: "amount", label: "金额", field: "amount", format: "currency" },
      ],
      limit: 6,
    },
  ],
} as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;

const rows = [
  { date: "2025-01-15", productName: "甲", amount: 5, rawSecret: "never-return" },
  { date: "2025-12-20", productName: "乙", amount: 10, rawSecret: "never-return" },
  { date: "2026-01-15", productName: "甲", amount: 20, rawSecret: "never-return" },
  { date: "2026-02-15T00:00:00.000Z", productName: "乙", amount: 30, rawSecret: "never-return" },
];

test("loads each source once, aggregates server-side, and returns only render DTO cells", async () => {
  const requests: Array<{ owner: string; targetId: number; fields: readonly string[] }> = [];
  const audits: WorkspaceAnalysisRuntimeAudit[] = [];
  const plan = await planFor([source], definition, async (request) => {
    requests.push({ owner: request.ownerUnitId, targetId: request.targetId, fields: request.fields });
    return {
      sourceKey: request.sourceKey,
      sourceVersion: request.sourceVersion,
      rows,
      pageCount: 2,
      byteCount: Buffer.byteLength(JSON.stringify(rows)),
    };
  });
  const runtime = await runWorkspaceAnalysisExecutionPlan({
    plan,
    onAudit: (audit) => { audits.push(audit); },
  });

  assert.deepEqual(requests, [{ owner: "finance", targetId: 7, fields: ["amount", "date", "productName"] }]);
  assert.deepEqual(runtime.filters.find((filter) => filter.key === "year")?.options, [
    { label: "2026年", value: "2026" },
    { label: "2025年", value: "2025" },
  ]);
  const metrics = runtime.blocks.find((block) => block.kind === "metrics");
  assert.equal(metrics?.kind === "metrics" ? metrics.metrics[0]?.value : null, 50);
  const chart = runtime.blocks.find((block) => block.kind === "chart");
  assert.equal(chart?.kind, "chart");
  if (chart?.kind === "chart") {
    assert.deepEqual(chart.groups[0]?.values[0], {
      metricKey: "amount",
      current: 20,
      previousPeriod: 10,
      previousYear: 5,
    });
  }
  const table = runtime.blocks.find((block) => block.kind === "table");
  assert.equal(table?.kind === "table" ? table.totalRows : null, 2);
  assert.equal(JSON.stringify(runtime).includes("rawSecret"), false);
  assert.equal(JSON.stringify(runtime).includes("never-return"), false);
  assert.deepEqual(runtime.execution.sources.map((item) => item.sourceKey), ["finance.shipments"]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.status, "succeeded");
  assert.equal(JSON.stringify(audits).includes("甲"), false);
});

test("fails closed on canonical field type drift", async () => {
  const plan = await planFor([source], definition, async () => ({
    sourceKey: "finance.shipments",
    sourceVersion: 1,
    rows: [{ date: "2026-01-01", productName: "甲", amount: "100" }],
    pageCount: 1,
    byteCount: 100,
  }));
  await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({
    plan,
  }), runtimeFailure("source_response_invalid"));
});

test("rejects a provider that under-reports canonical payload bytes", async () => {
  const plan = await planFor([source], definition, async () => ({
    sourceKey: "finance.shipments",
    sourceVersion: 1,
    rows: [{ date: "2026-01-01", productName: "甲".repeat(source.limits.maxBytes), amount: 1 }],
    pageCount: 1,
    byteCount: 1,
  }));

  await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({ plan }), runtimeFailure("source_response_invalid"));
});

test("fails explicitly on source row, byte, page, and timeout ceilings", async (t) => {
  await t.test("rows", async () => {
    const plan = await planFor([source], definition, async () => ({
      sourceKey: "finance.shipments",
      sourceVersion: 1,
      rows: Array.from({ length: 7 }, () => ({})),
      pageCount: 1,
      byteCount: 10,
    }));
    await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({
      plan,
    }), runtimeFailure("source_limit_exceeded"));
  });
  await t.test("bytes", async () => {
    const plan = await planFor([source], definition, async () => ({
      sourceKey: "finance.shipments",
      sourceVersion: 1,
      rows: [],
      pageCount: 1,
      byteCount: source.limits.maxBytes + 1,
    }));
    await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({
      plan,
    }), runtimeFailure("source_limit_exceeded"));
  });
  await t.test("pages", async () => {
    const plan = await planFor([source], definition, async () => ({
      sourceKey: "finance.shipments",
      sourceVersion: 1,
      rows: [],
      pageCount: 4,
      byteCount: 100,
    }));
    await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({
      plan,
    }), runtimeFailure("source_limit_exceeded"));
  });
  await t.test("timeout", async () => {
    const timeoutSource = { ...source, limits: { ...source.limits, timeoutMs: 100 } };
    const timeoutPlan = await planFor([timeoutSource], definition, async () => new Promise(() => undefined));
    await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({
      plan: timeoutPlan,
    }), runtimeFailure("timeout"));
  });
});

test("enforces the aggregate 500 table-row render ceiling without returning partial blocks", async () => {
  const largeSource = sourceDefinition("finance.large", {
    maxRows: 400,
    maxGroups: 60,
    maxPageSize: 400,
    maxPages: 1,
    maxBytes: 1_048_576,
    timeoutMs: 5_000,
  });
  const largeDefinition = {
    schemaVersion: 3,
    dataset: "workspace.sources",
    sources: [{ key: "large", sourceKey: "finance.large", sourceVersion: 1 }],
    filters: [],
    blocks: [
      tableBlock("first", "large", 300),
      tableBlock("second", "large", 300),
    ],
  } as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;
  const largeRows = Array.from({ length: 400 }, (_, index) => ({ productName: `产品${index}`, date: null, amount: index }));
  const plan = await planFor([largeSource], largeDefinition, async () => ({
    sourceKey: "finance.large",
    sourceVersion: 1,
    rows: largeRows,
    pageCount: 1,
    byteCount: 20_000,
  }));

  await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({
    plan,
  }), runtimeFailure("run_limit_exceeded"));
});

test("enforces the 10,000-row ceiling across multiple authorized sources", async () => {
  const limits = {
    maxRows: 6_000,
    maxGroups: 60,
    maxPageSize: 500,
    maxPages: 12,
    maxBytes: 5 * 1024 * 1024,
    timeoutMs: 5_000,
  } as const;
  const first = sourceDefinition("finance.first", limits);
  const second = sourceDefinition("finance.second", limits);
  const multiDefinition = {
    schemaVersion: 3,
    dataset: "workspace.sources",
    sources: [
      { key: "first", sourceKey: "finance.first", sourceVersion: 1 },
      { key: "second", sourceKey: "finance.second", sourceVersion: 1 },
    ],
    filters: [],
    blocks: [
      { key: "firstCount", kind: "metrics", source: "first", metrics: [{ key: "count", label: "数量", operation: "count" }] },
      { key: "secondCount", kind: "metrics", source: "second", metrics: [{ key: "count", label: "数量", operation: "count" }] },
    ],
  } as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;
  const calls: string[] = [];
  const plan = await planFor([first, second], multiDefinition, async (request) => {
    calls.push(request.sourceKey);
    const loadedRows = Array.from({ length: 6_000 }, () => ({}));
    return {
      sourceKey: request.sourceKey,
      sourceVersion: request.sourceVersion,
      rows: loadedRows,
      pageCount: 12,
      byteCount: Buffer.byteLength(JSON.stringify(loadedRows)),
    };
  });

  await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({
    plan,
  }), runtimeFailure("run_limit_exceeded"));
  assert.deepEqual(calls, ["finance.first", "finance.second"]);
});

test("enforces aggregate page and byte ceilings across multiple sources", async (t) => {
  const limits = {
    maxRows: 100,
    maxGroups: 60,
    maxPageSize: 10,
    maxPages: 30,
    maxBytes: 8 * 1024 * 1024,
    timeoutMs: 12_000,
  } as const;
  const first = sourceDefinition("finance.first", limits);
  const second = sourceDefinition("finance.second", limits);
  const multiDefinition = twoSourceCountDefinition("finance.first", "finance.second");

  await t.test("pages", async () => {
    const requestedPageLimits: number[] = [];
    const plan = await planFor([first, second], multiDefinition, async (request) => {
      requestedPageLimits.push(request.limits.maxPages);
      return {
        sourceKey: request.sourceKey,
        sourceVersion: request.sourceVersion,
        rows: [],
        pageCount: request.sourceKey === "finance.first" ? 25 : 20,
        byteCount: 2,
      };
    });

    await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({ plan }), runtimeFailure("run_limit_exceeded"));
    assert.deepEqual(requestedPageLimits, [30, 15]);
  });

  await t.test("bytes", async () => {
    const requestedByteLimits: number[] = [];
    const plan = await planFor([first, second], multiDefinition, async (request) => {
      requestedByteLimits.push(request.limits.maxBytes);
      return {
        sourceKey: request.sourceKey,
        sourceVersion: request.sourceVersion,
        rows: [],
        pageCount: 1,
        byteCount: request.sourceKey === "finance.first" ? 6 * 1024 * 1024 : 5 * 1024 * 1024,
      };
    });

    await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({ plan }), runtimeFailure("run_limit_exceeded"));
    assert.deepEqual(requestedByteLimits, [8 * 1024 * 1024, 4 * 1024 * 1024]);
  });
});

test("passes only the remaining global timeout budget to later sources", async (t) => {
  const limits = {
    maxRows: 100,
    maxGroups: 60,
    maxPageSize: 100,
    maxPages: 1,
    maxBytes: 1_048_576,
    timeoutMs: 12_000,
  } as const;
  const first = sourceDefinition("finance.first", limits);
  const second = sourceDefinition("finance.second", limits);
  const requestedTimeouts: number[] = [];
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const plan = await planFor(
    [first, second],
    twoSourceCountDefinition("finance.first", "finance.second"),
    async (request) => {
      requestedTimeouts.push(request.limits.timeoutMs);
      if (request.sourceKey === "finance.first") now = 8_001;
      return {
        sourceKey: request.sourceKey,
        sourceVersion: request.sourceVersion,
        rows: [],
        pageCount: 1,
        byteCount: 2,
      };
    },
  );

  await runWorkspaceAnalysisExecutionPlan({ plan });
  assert.deepEqual(requestedTimeouts, [12_000, 3_999]);
});

test("fails closed when the end-to-end runtime deadline expires before returning render DTO", async (t) => {
  const audits: WorkspaceAnalysisRuntimeAudit[] = [];
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const deadlineSource = sourceDefinition("finance.deadline", {
    maxRows: 10,
    maxGroups: 10,
    maxPageSize: 10,
    maxPages: 1,
    maxBytes: 1_048_576,
    timeoutMs: 12_000,
  });
  const deadlineDefinition = {
    schemaVersion: 3,
    dataset: "workspace.sources",
    sources: [{ key: "deadline", sourceKey: "finance.deadline", sourceVersion: 1 }],
    filters: [],
    blocks: [
      { key: "count", kind: "metrics", source: "deadline", metrics: [{ key: "count", label: "数量", operation: "count" }] },
    ],
  } as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;
  const plan = await planFor([deadlineSource], deadlineDefinition, async () => {
    now = 12_001;
    return {
      sourceKey: "finance.deadline",
      sourceVersion: 1,
      rows: [],
      pageCount: 1,
      byteCount: 2,
    };
  });

  await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({
    plan,
    onAudit: (audit) => { audits.push(audit); },
  }), runtimeFailure("timeout"));
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.status, "failed");
  assert.equal(audits[0]?.errorCode, "timeout");
  assert.equal(JSON.stringify(audits).includes("parameters"), false);
  assert.equal(JSON.stringify(audits).includes("rows"), false);
});

test("enforces the aggregate 60-group chart render ceiling", async () => {
  const chartSource = sourceDefinition("finance.grouped", {
    maxRows: 100,
    maxGroups: 100,
    maxPageSize: 100,
    maxPages: 1,
    maxBytes: 1_048_576,
    timeoutMs: 5_000,
  });
  const chartDefinition = {
    schemaVersion: 3,
    dataset: "workspace.sources",
    sources: [{ key: "grouped", sourceKey: "finance.grouped", sourceVersion: 1 }],
    filters: [],
    blocks: [
      countChartBlock("first", "grouped", 40),
      countChartBlock("second", "grouped", 40),
    ],
  } as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;
  const groupedRows = Array.from({ length: 40 }, (_, index) => ({ productName: `产品${index + 1}` }));
  const plan = await planFor([chartSource], chartDefinition, async () => ({
    sourceKey: "finance.grouped",
    sourceVersion: 1,
    rows: groupedRows,
    pageCount: 1,
    byteCount: 2_000,
  }));

  await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({ plan }), runtimeFailure("run_limit_exceeded"));
});

test("enforces source group limits against the unsliced comparison pool", async () => {
  const comparisonSource = sourceDefinition("finance.comparison", {
    maxRows: 10,
    maxGroups: 2,
    maxPageSize: 10,
    maxPages: 1,
    maxBytes: 1_048_576,
    timeoutMs: 5_000,
  });
  const comparisonDefinition = {
    schemaVersion: 3,
    dataset: "workspace.sources",
    sources: [{ key: "comparison", sourceKey: "finance.comparison", sourceVersion: 1 }],
    filters: [
      { key: "year", label: "年份", source: "comparison", field: "date", kind: "year", defaultValue: "2026" },
    ],
    blocks: [{
      key: "trend",
      kind: "chart",
      source: "comparison",
      title: "趋势",
      dimension: { field: "date", bucket: "month" },
      metrics: [{ key: "amount", label: "金额", operation: "sum", field: "amount" }],
      comparison: "yearOverYear",
      limit: 2,
    }],
  } as const satisfies WorkspaceSourcesOperationalAnalysisDefinition;
  const comparisonRows = [
    { date: "2024-01-01", amount: 1 },
    { date: "2025-01-01", amount: 2 },
    { date: "2026-01-01", amount: 3 },
  ];
  const plan = await planFor([comparisonSource], comparisonDefinition, async () => ({
    sourceKey: "finance.comparison",
    sourceVersion: 1,
    rows: comparisonRows,
    pageCount: 1,
    byteCount: Buffer.byteLength(JSON.stringify(comparisonRows)),
  }));

  await assert.rejects(() => runWorkspaceAnalysisExecutionPlan({ plan }), runtimeFailure("source_limit_exceeded"));
});

async function planFor(
  sources: readonly WorkspaceAnalysisSourceDefinition[],
  template: WorkspaceSourcesOperationalAnalysisDefinition,
  loadSource: WorkspaceAnalysisSourceLoader,
): Promise<WorkspaceAnalysisExecutionPlan> {
  const directory = createWorkspaceAnalysisSourceDirectory([{
    ownerUnitId: "finance",
    listAvailableSources: async () => sources,
    loadSource,
  }]);
  const result = await directory.list({ requesterId: 7, targetType: "personal", targetId: 7 });
  const compiled = buildWorkspaceAnalysisExecutionPlan({
    authorizedSources: result.authorizedSources,
    definition: template,
  });
  if (!compiled.ok) {
    assert.fail(JSON.stringify(compiled.issues));
  }
  return compiled.plan;
}

function sourceDefinition(
  sourceKey: string,
  limits: WorkspaceAnalysisSourceDefinition["limits"],
): WorkspaceAnalysisSourceDefinition {
  return {
    sourceKey,
    version: 1,
    label: sourceKey,
    description: `${sourceKey} 测试事实。`,
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
      {
        key: "date",
        label: "日期",
        description: "事实日期。",
        kind: "date",
        sensitivity: "internal",
        exportPolicy: "allowed",
        capabilities: { displayable: true, filterOperators: ["year", "month"], groupable: true, aggregateOperations: ["count"] },
      },
      {
        key: "productName",
        label: "产品",
        description: "产品名称。",
        kind: "text",
        sensitivity: "internal",
        exportPolicy: "allowed",
        capabilities: { displayable: true, filterOperators: ["contains"], groupable: true, aggregateOperations: ["count", "distinctCount"] },
      },
      {
        key: "amount",
        label: "金额",
        description: "事实金额。",
        kind: "currency",
        sensitivity: "confidential",
        exportPolicy: "allowed",
        capabilities: { displayable: true, filterOperators: [], groupable: false, aggregateOperations: ["count", "sum", "average", "min", "max"] },
      },
    ],
    limits,
  };
}

function tableBlock(key: string, sourceAlias: string, limit: number) {
  return {
    key,
    kind: "table" as const,
    source: sourceAlias,
    title: key,
    columns: [{ key: "product", label: "产品", field: "productName" }],
    limit,
  };
}
function runtimeFailure(code: string) {
  return (error: unknown) => error instanceof WorkspaceAnalysisRuntimeError && error.code === code;
}
