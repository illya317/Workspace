import assert from "node:assert/strict";
import test from "node:test";

import type { BodySurfaceSectionSpec, FormSurfaceProps } from "@workspace/core/ui";

import {
  COMPARISON_ACCOUNTING_NOTICE,
  createComparisonLineDetailSections,
  createComparisonReadySections,
} from "./statement-comparison-run-sections";
import {
  buildComparisonResultColumns,
  buildComparisonResultFilterToolbarItems,
  createComparisonMappingSections,
  createComparisonPreviewSections,
  createComparisonSummarySection,
  createComparisonUploadSections,
} from "./statement-comparison-sections";
import type {
  ComparisonMappingProposalDto,
  ComparisonPackageDetailDto,
  ComparisonRunDetailDto,
  ComparisonRunLineDto,
  ComparisonTargetPreviewDto,
} from "./statement-comparison-types";

/**
 * 差异诊断 Surface builder 测试（Package 7，计划 §11 UI 矩阵）。
 */

function formActions(section: BodySurfaceSectionSpec) {
  const body = section.body as { kind: string; form?: FormSurfaceProps };
  assert.equal(body.kind, "form");
  return body.form?.actions ?? [];
}

function messageContent(section: BodySurfaceSectionSpec): string {
  const body = section.body as { kind: string; message?: { content: unknown } };
  assert.equal(body.kind, "section");
  return String(body.message?.content ?? "");
}

function line(overrides: Partial<ComparisonRunLineDto> = {}): ComparisonRunLineDto {
  return {
    lineCode: "lti",
    lineLabel: "长期股权投资",
    sortOrder: 9,
    sourceSheet: "合并资产负债表",
    sourceCell: "C12",
    externalAmount: "88054250.60",
    systemAmount: "88000000.00",
    differenceAmount: "54250.60",
    explainedAmount: "54250.60",
    residualAmount: "0.00",
    explanationStatus: "exact",
    explanationMethod: "direct",
    evidence: [{
      evidenceId: "ev_voucherLine_abc",
      sourceKind: "voucherLine",
      sourceRecordId: "voucherItem:123",
      sourceFingerprint: "fp",
      amount: "54250.60",
      currencyCode: "CNY",
      company: { id: 7, code: "02", name: "测试公司" },
      date: "2026-06-30",
      period: { year: 2026, month: 6 },
      account: { id: 11, code: "1511", name: "长期股权投资" },
      voucher: { voucherId: 9, voucherNo: "2026-06-记-0009", voucherDate: "2026-06-30", itemId: 123, sortOrder: 1, counterpartAccounts: [] },
      consolidation: null,
      workbook: null,
      translation: null,
      label: "凭证 2026-06-记-0009 第1行",
      deepLink: null,
    }],
    alternatives: [],
    diagnostics: {
      accountingTreatment: "not_evaluated",
      stopReason: "direct_hit",
      candidatesTruncated: false,
      budgets: {
        tolerance: "0",
        maxTerms: 6,
        maxSolutions: 20,
        maxCandidatesAfterFilter: 40,
        maxVisitedStates: 250000,
        deadlineMs: 1000,
        providerCandidateLimit: 200,
        amountWindowUpper: "54250.60",
      },
      versions: { orchestrator: "amount-origin@1", solverAdapterId: "bounded-reference", solverAdapterVersion: "1" },
      fingerprints: { input: "fp-input", output: "fp-output" },
      providers: [],
      solver: null,
    },
    externalCell: {
      sheet: "合并资产负债表",
      a1: "C12",
      type: "n",
      value: 88054250.6,
      text: "88,054,250.60",
      formula: "SUM(C5:C11)",
      cachedValue: 88054250.6,
      recalculatedValue: 88054250.6,
      trust: "recalculated_match",
    },
    ...overrides,
  };
}

function run(): ComparisonRunDetailDto {
  return {
    id: 31,
    mappingId: 3,
    status: "completed",
    failureCode: null,
    failureMessage: null,
    targetFingerprint: "fp-target",
    orchestratorId: "amount-origin",
    orchestratorVersion: "1",
    formulaAdapterId: null,
    formulaAdapterVersion: null,
    solverAdapterId: "bounded-reference",
    solverAdapterVersion: "1",
    inputFingerprint: "fp-in",
    outputFingerprint: "fp-out",
    createdAt: "2026-08-06T00:00:00.000Z",
    completedAt: "2026-08-06T00:00:01.000Z",
    summary: {
      totalLines: 1,
      differingLines: 1,
      exact: 1,
      near: 0,
      ambiguous: 0,
      notFound: 0,
      truncated: 0,
      notEvaluated: 0,
      totalAbsoluteResidual: "0.00",
      accountingTreatment: "not_evaluated",
    },
    lines: [line()],
  };
}

test("结果表格列恰为六列且无 action 列", () => {
  const columns = buildComparisonResultColumns(null);
  assert.deepEqual(
    columns.map((column) => column.label),
    ["报表项目", "Excel 金额", "系统金额", "差异", "解释状态", "最佳来源"],
  );
  // 无 actionsColumn/rowActions：整行选中由 onRowClick 承担。
  for (const column of columns) {
    assert.ok(!("actions" in column));
  }
  const selected = buildComparisonResultColumns("lti");
  assert.equal(selected[0]!.cellSelected?.(line()), true);
  assert.equal(selected[0]!.cellSelected?.(line({ lineCode: "other" })), false);
});

test("行 detail 为六段结构化证据且含固定会计提示", () => {
  const sections = createComparisonLineDetailSections({ line: line(), run: run() });
  assert.equal(sections.length, 6);
  assert.equal(sections[0]!.key, "comparison-detail-cell");
  assert.equal(sections[1]!.key, "comparison-detail-lineage");
  assert.equal(sections[2]!.key, "comparison-detail-best");
  assert.equal(sections[3]!.key, "comparison-detail-evidence");
  assert.equal(sections[4]!.key, "comparison-detail-diagnostics");
  assert.equal(sections[5]!.key, "comparison-detail-notice");
  assert.equal(messageContent(sections[5]!), COMPARISON_ACCOUNTING_NOTICE);
  assert.equal(COMPARISON_ACCOUNTING_NOTICE, "仅解释金额来源；会计处理未评估。");
  // 外部单元格段包含 raw/formatted/cached/formula/recalc/trust。
  const cellPanel = sections[0]!;
  const cellMessages = (cellPanel.body as { sections?: BodySurfaceSectionSpec[] }).sections ?? [];
  const cellText = cellMessages.map(messageContent).join("\n");
  assert.ok(cellText.includes("88,054,250.60"));
  assert.ok(cellText.includes("SUM(C5:C11)"));
  assert.ok(cellText.includes("recalculated_match"));
});

test("无 import 权限时上传隐藏且只读路径保留", () => {
  const denied = createComparisonUploadSections({
    canImport: false,
    uploadFile: null,
    uploading: false,
    uploadError: null,
    onFileChange: () => {},
    onUpload: () => {},
  });
  assert.equal(denied.length, 1);
  assert.ok(messageContent(denied[0]!).includes("没有上传 Excel 并发起对比的权限"));

  const allowed = createComparisonUploadSections({
    canImport: true,
    uploadFile: null,
    uploading: false,
    uploadError: null,
    onFileChange: () => {},
    onUpload: () => {},
  });
  const fields = allowed.find((section) => section.key === "comparison-upload-fields");
  assert.ok(fields);
  assert.equal(formActions(fields!)[0]!.disabled, true);
});

test("系统报表摘要不暴露指纹或不可变实现细节", () => {
  const sections = createComparisonPreviewSections({
    preview: {
      target: { kind: "entity", companyCode: "630", year: 2026, month: 8, periodKind: "cumulative", reportType: "balance" },
      targetLabel: "丰华天力通 2026年8月",
      currencyCode: "CNY",
      lineCount: 71,
      targetFingerprint: "secret-fingerprint",
    } as unknown as ComparisonTargetPreviewDto,
    staleMapping: false,
  });
  const panel = sections[0]!;
  const body = panel.body as { sections?: BodySurfaceSectionSpec[] };
  const text = (body.sections ?? []).map(messageContent).join("\n");
  assert.equal(panel.header?.title, "系统报表");
  assert.ok(text.includes("丰华天力通 2026年8月"));
  assert.ok(!text.includes("secret-fingerprint"));
  assert.ok(!text.includes("不可变"));
});

function proposalWithAmbiguous(): ComparisonMappingProposalDto {
  return {
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
      { label: "长期投资", normalizedLabel: "长期投资", row: 9, labelCell: "A9", status: "ambiguous", lineCode: null, candidates: ["lti", "lti2"], amountCells: ["C9"] },
    ],
    missingLines: [],
    autoAcceptedCount: 0,
    pendingCount: 1,
  };
}

test("歧义映射未确认时确认动作禁用", () => {
  const sections = createComparisonMappingSections({
    proposals: [proposalWithAmbiguous()],
    selectedProposalIndex: 0,
    choices: {},
    canUpdate: true,
    confirming: false,
    remapMode: false,
    onProposalChange: () => {},
    onChoiceChange: () => {},
    onConfirm: () => {},
  });
  const choices = sections.find((section) => section.key === "comparison-mapping-confirm");
  assert.ok(choices);
  const nested = (choices!.body as { sections?: BodySurfaceSectionSpec[] }).sections ?? [];
  const choiceFields = nested.find((section) => section.key === "comparison-mapping-choices");
  assert.ok(choiceFields);
  assert.equal(formActions(choiceFields!)[0]!.disabled, true);

  const resolved = createComparisonMappingSections({
    proposals: [proposalWithAmbiguous()],
    selectedProposalIndex: 0,
    choices: { 9: "lti" },
    canUpdate: true,
    confirming: false,
    remapMode: false,
    onProposalChange: () => {},
    onChoiceChange: () => {},
    onConfirm: () => {},
  });
  const nestedResolved = (resolved.find((section) => section.key === "comparison-mapping-confirm")!.body as { sections?: BodySurfaceSectionSpec[] }).sections ?? [];
  const resolvedFields = nestedResolved.find((section) => section.key === "comparison-mapping-choices");
  assert.equal(formActions(resolvedFields!)[0]!.disabled, false);
  assert.equal(formActions(resolvedFields!)[0]!.label, "开始对比");
});

test("无 update 权限时映射确认禁用并保留只读提示", () => {
  const sections = createComparisonMappingSections({
    proposals: [proposalWithAmbiguous()],
    selectedProposalIndex: 0,
    choices: { 9: "lti" },
    canUpdate: false,
    confirming: false,
    remapMode: false,
    onProposalChange: () => {},
    onChoiceChange: () => {},
    onConfirm: () => {},
  });
  const nested = (sections.find((section) => section.key === "comparison-mapping-confirm")!.body as { sections?: BodySurfaceSectionSpec[] }).sections ?? [];
  const choices = nested.find((section) => section.key === "comparison-mapping-choices");
  assert.equal(formActions(choices!)[0]!.disabled, true);
  assert.ok(messageContent(nested.find((section) => section.key === "comparison-mapping-no-update")!).includes("没有选择 Excel 报表项目"));
});

test("ready 面板只显示 Excel 和开始对比，stale 时禁用", () => {
  const detail = {
    id: 5,
    fileName: "对比.xlsx",
    fileSize: 2048,
    sha256: "sha-workbook",
    lifecycle: "ready",
    detection: null,
    sheets: [],
    mappings: [],
  } as unknown as ComparisonPackageDetailDto;
  const mapping = {
    id: 3,
    revision: 2,
    status: "confirmed",
    targetKind: "entity",
    reportType: "balance",
    targetFingerprint: "fp-old",
    confirmedAt: null,
    updatedAt: "",
    runs: [],
  };
  const stale = createComparisonReadySections({
    packageDetail: detail,
    activeMapping: mapping,
    staleMapping: true,
    canCreate: true,
    canUpdate: true,
    creatingRun: false,
    archiving: false,
    onCreateRun: () => {},
    onRemap: () => {},
    onArchive: () => {},
    onSelectRun: () => {},
  });
  const summaryPanel = stale.find((section) => section.key === "comparison-ready-summary");
  const nested = (summaryPanel!.body as { sections?: BodySurfaceSectionSpec[] }).sections ?? [];
  const actions = formActions(nested.find((section) => section.key === "comparison-ready-actions")!);
  assert.equal(actions.find((action) => action.key === "create-run")!.disabled, true);
  assert.ok(!actions.some((action) => action.key === "archive"));

  const fresh = createComparisonReadySections({
    packageDetail: {
      ...detail,
      mappings: [{ id: 3, revision: 2, status: "confirmed", targetKind: "entity", reportType: "balance", targetFingerprint: "fp-a", confirmedAt: null, updatedAt: "", runs: [{ id: 31 }] }],
    } as unknown as ComparisonPackageDetailDto,
    activeMapping: { ...mapping, targetFingerprint: "fp-a", runs: [] },
    staleMapping: false,
    canCreate: true,
    canUpdate: true,
    creatingRun: false,
    archiving: false,
    onCreateRun: () => {},
    onRemap: () => {},
    onArchive: () => {},
    onSelectRun: () => {},
  });
  const freshNested = (fresh.find((section) => section.key === "comparison-ready-summary")!.body as { sections?: BodySurfaceSectionSpec[] }).sections ?? [];
  const freshActions = formActions(freshNested.find((section) => section.key === "comparison-ready-actions")!);
  assert.equal(freshActions.find((action) => action.key === "create-run")!.disabled, false);
  assert.equal(freshActions.find((action) => action.key === "create-run")!.label, "开始对比");
  assert.ok(!freshActions.some((action) => action.key === "archive"));
  const rendered = JSON.stringify(fresh);
  assert.ok(!rendered.includes("SHA-256"));
  assert.ok(!rendered.includes("指纹"));
  assert.ok(!rendered.includes("运行历史"));
});

test("过滤器工具栏包含仅差异/状态/阈值/查询", () => {
  const items = buildComparisonResultFilterToolbarItems({
    onlyDifferences: false,
    status: "all",
    absThreshold: "",
    query: "",
    onOnlyDifferencesChange: () => {},
    onStatusChange: () => {},
    onAbsThresholdChange: () => {},
    onQueryChange: () => {},
  });
  assert.deepEqual(items.map((item) => item.kind), ["search", "select", "select", "select"]);
});

test("汇总指标 section 呈现七项指标", () => {
  const section = createComparisonSummarySection(run().summary);
  const body = section.body as { kind: string; data?: { metrics?: { label: unknown }[] } };
  assert.equal(body.kind, "data");
  assert.equal(body.data?.metrics?.length, 7);
});
