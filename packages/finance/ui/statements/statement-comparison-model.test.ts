import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTargetPreviewQuery,
  COMPARISON_MAPPING_SKIP,
  comparisonSummaryMetrics,
  confirmedMappingForTarget,
  deriveComparisonUiState,
  filterComparisonLines,
  hasUnresolvedComparisonResults,
  isComparisonMappingConfirmable,
  isComparisonMappingStale,
  mapConsolidatedReportType,
  mapEntityPeriodKind,
  pendingComparisonMappingLines,
  resolveComparisonLineMapping,
  selectableComparisonPackages,
  selectionFromLaunchContext,
  validateComparisonUploadFile,
} from "./statement-comparison-model";
import type {
  ComparisonLineMappingEntryDto,
  ComparisonMappingProposalDto,
  ComparisonPackageDetailDto,
  ComparisonRunLineDto,
  ComparisonRunSummaryDto,
} from "./statement-comparison-types";

/**
 * 差异诊断纯模型测试（Package 7，计划 §11 UI 矩阵的行为层）。
 */

function summary(overrides: Partial<ComparisonRunSummaryDto> = {}): ComparisonRunSummaryDto {
  return {
    totalLines: 10,
    differingLines: 3,
    exact: 2,
    near: 0,
    ambiguous: 0,
    notFound: 0,
    truncated: 0,
    notEvaluated: 1,
    totalAbsoluteResidual: "0.00",
    accountingTreatment: "not_evaluated",
    ...overrides,
  };
}

function line(overrides: Partial<ComparisonRunLineDto> = {}): ComparisonRunLineDto {
  return {
    lineCode: "cash",
    lineLabel: "货币资金",
    sortOrder: 0,
    sourceSheet: "资产负债表",
    sourceCell: "C5",
    externalAmount: "100.00",
    systemAmount: "90.00",
    differenceAmount: "10.00",
    explainedAmount: "10.00",
    residualAmount: "0.00",
    explanationStatus: "exact",
    explanationMethod: "direct",
    evidence: [],
    alternatives: [],
    diagnostics: null,
    externalCell: null,
    ...overrides,
  };
}

function preview(fingerprint = "fp-a") {
  return {
    target: {
      kind: "entity" as const,
      companyId: 7,
      year: 2026,
      month: 6,
      periodKind: "cumulative" as const,
      reportType: "balance" as const,
      targetFingerprint: fingerprint,
    },
    lineCount: 2,
    currencyCode: "CNY",
    targetLabel: "测试公司 2026年6月",
  };
}

test("七种 UI 状态按目标/证据包/运行推导", () => {
  const base = { preview: null, uploading: false, uploadError: null, packageDetail: null, runDetail: null };
  assert.equal(deriveComparisonUiState(base), "empty");
  assert.equal(deriveComparisonUiState({ ...base, uploading: true }), "parsing");
  assert.equal(deriveComparisonUiState({ ...base, preview: preview() }), "targetReady");
  assert.equal(deriveComparisonUiState({ ...base, preview: preview(), uploadError: "bad" }), "failed");
  assert.equal(deriveComparisonUiState({
    ...base,
    preview: preview(),
    packageDetail: { lifecycle: "failed" } as ComparisonPackageDetailDto,
  }), "failed");
  assert.equal(deriveComparisonUiState({
    ...base,
    preview: preview(),
    packageDetail: { lifecycle: "mappingRequired" } as ComparisonPackageDetailDto,
  }), "mappingRequired");
  assert.equal(deriveComparisonUiState({
    ...base,
    preview: preview(),
    packageDetail: { lifecycle: "ready" } as ComparisonPackageDetailDto,
  }), "ready");
  assert.equal(deriveComparisonUiState({
    ...base,
    preview: preview(),
    packageDetail: { lifecycle: "ready" } as ComparisonPackageDetailDto,
    runDetail: { status: "completed" } as never,
  }), "completed");
  assert.equal(deriveComparisonUiState({
    ...base,
    preview: preview(),
    packageDetail: { lifecycle: "ready" } as ComparisonPackageDetailDto,
    runDetail: { status: "failed" } as never,
  }), "failed");
});

test("存在歧义/未解释/截断时绝不标注已对账", () => {
  assert.equal(hasUnresolvedComparisonResults(summary()), false);
  assert.equal(hasUnresolvedComparisonResults(summary({ ambiguous: 1 })), true);
  assert.equal(hasUnresolvedComparisonResults(summary({ notFound: 2 })), true);
  assert.equal(hasUnresolvedComparisonResults(summary({ truncated: 1 })), true);
  for (const metrics of [
    comparisonSummaryMetrics(summary()),
    comparisonSummaryMetrics(summary({ ambiguous: 1, truncated: 1 })),
  ]) {
    assert.ok(metrics.every((metric) => !metric.label.includes("已对账") && !metric.label.includes("reconciled")));
  }
  assert.deepEqual(
    comparisonSummaryMetrics(summary()).map((metric) => metric.label),
    ["报表行", "差异行", "精确解释", "歧义", "未解释", "被截断", "|未解释残差| 合计"],
  );
});

test("结果过滤器：仅差异/状态/阈值/文本查询", () => {
  const lines = [
    line({ lineCode: "cash", differenceAmount: "10.00", explanationStatus: "exact" }),
    line({ lineCode: "ar", lineLabel: "应收账款", differenceAmount: "0.00", explanationStatus: "exact" }),
    line({ lineCode: "goodwill", lineLabel: "商誉", differenceAmount: "-5000.00", explanationStatus: "ambiguous" }),
    line({ lineCode: "other", lineLabel: "其他", differenceAmount: null, explanationStatus: "notEvaluated" }),
  ];
  assert.deepEqual(
    filterComparisonLines(lines, { onlyDifferences: true, status: "all", absThreshold: "", query: "" }).map((row) => row.lineCode),
    ["cash", "goodwill"],
  );
  assert.deepEqual(
    filterComparisonLines(lines, { onlyDifferences: false, status: "ambiguous", absThreshold: "", query: "" }).map((row) => row.lineCode),
    ["goodwill"],
  );
  assert.deepEqual(
    filterComparisonLines(lines, { onlyDifferences: true, status: "all", absThreshold: "100", query: "" }).map((row) => row.lineCode),
    ["goodwill"],
  );
  assert.deepEqual(
    filterComparisonLines(lines, { onlyDifferences: false, status: "all", absThreshold: "", query: "应收" }).map((row) => row.lineCode),
    ["ar"],
  );
});

test("歧义映射未确认时禁建 run（confirmable=false）", () => {
  const proposal: ComparisonMappingProposalDto = {
    structure: {
      sheetName: "资产负债表",
      sheetIndex: 0,
      visibility: "visible",
      reportType: "balance",
      score: 6,
      headerRow: 3,
      labelColumn: 0,
      blockStartRow: 4,
      blockEndRow: 40,
      amountColumns: [{ col: 2, headerText: "期末余额" }],
      mergedHeader: false,
    },
    lines: [
      { label: "货币资金", normalizedLabel: "货币资金", row: 5, labelCell: "A5", status: "auto_accepted", lineCode: "cash", candidates: [], amountCells: ["C5"] },
      { label: "长期投资", normalizedLabel: "长期投资", row: 9, labelCell: "A9", status: "ambiguous", lineCode: null, candidates: ["lti", "lti2"], amountCells: ["C9"] },
    ] as ComparisonLineMappingEntryDto[],
    missingLines: [],
    autoAcceptedCount: 1,
    pendingCount: 1,
  };
  assert.deepEqual(pendingComparisonMappingLines(proposal.lines).map((entry) => entry.row), [9]);
  assert.equal(isComparisonMappingConfirmable(proposal, {}), false);
  assert.equal(isComparisonMappingConfirmable(proposal, { 9: "lti" }), true);
  assert.equal(isComparisonMappingConfirmable(proposal, { 9: COMPARISON_MAPPING_SKIP }), true);
  assert.equal(isComparisonMappingConfirmable(null, {}), false);

  const resolved = resolveComparisonLineMapping(proposal.lines, { 9: "lti" });
  assert.equal(resolved[1]!.status, "auto_accepted");
  assert.equal(resolved[1]!.lineCode, "lti");
  const skipped = resolveComparisonLineMapping(proposal.lines, { 9: COMPARISON_MAPPING_SKIP });
  assert.equal(skipped[1]!.status, "unmatched");
  assert.equal(skipped[1]!.lineCode, null);
  // 服务端规则：处置后的 lineMapping 不再有 ambiguous/duplicate。
  assert.equal(pendingComparisonMappingLines(resolved).length, 0);
  assert.equal(pendingComparisonMappingLines(skipped).length, 0);
});

test("launch context 与 target-preview 查询保持类型化映射", () => {
  assert.deepEqual(selectionFromLaunchContext({
    kind: "entity",
    companyCode: "02",
    companyName: "测试公司",
    year: 2026,
    month: 6,
    periodKind: "quarter",
    reportType: "income",
  }), {
    kind: "entity",
    companyCode: "02",
    year: 2026,
    month: 6,
    periodKind: "cumulative",
    reportType: "income",
  });
  assert.deepEqual(selectionFromLaunchContext({
    kind: "consolidated",
    parentCompanyId: 1,
    parentName: "集团",
    batchId: 22,
    batchLabel: "批次 #22",
    reportType: "cashflow",
  }), { kind: "consolidated", batchId: 22, reportType: "cashflow" });

  const entityQuery = buildTargetPreviewQuery({
    kind: "entity",
    companyCode: "02",
    year: 2026,
    month: 6,
    periodKind: "cumulative",
    reportType: "balance",
  });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(entityQuery)), {
    kind: "entity",
    companyCode: "02",
    year: "2026",
    month: "6",
    periodKind: "cumulative",
    reportType: "balance",
  });
  const consolidatedQuery = buildTargetPreviewQuery({ kind: "consolidated", batchId: 22, reportType: "balance" });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(consolidatedQuery)), {
    kind: "consolidated",
    batchId: "22",
    reportType: "balance",
  });
});

test("报表类型与期间口径词表映射", () => {
  assert.equal(mapConsolidatedReportType("balanceSheet"), "balance");
  assert.equal(mapConsolidatedReportType("incomeStatement"), "income");
  assert.equal(mapConsolidatedReportType("cashFlow"), "cashflow");
  assert.equal(mapEntityPeriodKind("month"), "monthly");
  assert.equal(mapEntityPeriodKind("year"), "cumulative");
});

test("映射 stale 判定与目标绑定", () => {
  const detail = {
    lifecycle: "ready",
    mappings: [
      { id: 3, revision: 1, status: "confirmed", targetKind: "entity", reportType: "balance", targetFingerprint: "fp-a", confirmedAt: null, updatedAt: "", runs: [] },
      { id: 4, revision: 1, status: "confirmed", targetKind: "entity", reportType: "income", targetFingerprint: "fp-a", confirmedAt: null, updatedAt: "", runs: [] },
    ],
  } as unknown as ComparisonPackageDetailDto;
  assert.equal(confirmedMappingForTarget(detail, preview("fp-a"))?.id, 3);
  assert.equal(confirmedMappingForTarget(detail, preview("fp-b")), null);
  assert.equal(isComparisonMappingStale({ targetFingerprint: "fp-a" }, preview("fp-a")), false);
  assert.equal(isComparisonMappingStale({ targetFingerprint: "fp-old" }, preview("fp-a")), true);
  assert.equal(isComparisonMappingStale(null, preview("fp-a")), false);
});

test("证据包过滤与上传预检", () => {
  const packages = [
    { id: 1, lifecycle: "ready" },
    { id: 2, lifecycle: "archived" },
    { id: 3, lifecycle: "failed" },
  ] as never[];
  assert.deepEqual(selectableComparisonPackages(packages).map((item) => item.id), [1, 3]);

  assert.equal(validateComparisonUploadFile(null), "请选择 .xlsx 工作簿文件");
  assert.equal(validateComparisonUploadFile({ name: "a.xls", size: 10 } as File), "仅支持 .xlsx 工作簿");
  assert.equal(validateComparisonUploadFile({ name: "a.xlsx", size: 0 } as File), "文件不能为空");
  assert.equal(validateComparisonUploadFile({ name: "a.xlsx", size: 21 * 1024 * 1024 } as File), "文件超过 20 MiB 上限");
  assert.equal(validateComparisonUploadFile({ name: "a.xlsx", size: 1024 } as File), null);
});
