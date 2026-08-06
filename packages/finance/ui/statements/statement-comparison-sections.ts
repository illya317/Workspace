import {
  createEmptySection,
  createFieldsSection,
  createMessageSection,
  createMetricsSection,
  createPanelSection,
} from "@workspace/core/ui";
import type {
  BodySurfaceSectionSpec,
  DataSurfaceCellSpec,
  DataSurfaceColumnSpec,
  FormSurfaceItemSpec,
  SurfaceToolbarItems,
} from "@workspace/core/ui";

import {
  COMPARISON_MAPPING_SKIP,
  COMPARISON_PERIOD_KIND_OPTIONS,
  COMPARISON_REPORT_TYPE_OPTIONS,
  COMPARISON_TARGET_KIND_OPTIONS,
  comparisonBestSourceLabel,
  comparisonExplanationStatusLabel,
  comparisonExplanationStatusTone,
  comparisonMappingLineStatusLabel,
  comparisonReportTypeLabel,
  comparisonSummaryMetrics,
  isComparisonMappingConfirmable,
  pendingComparisonMappingLines,
  type ComparisonMappingChoices,
  type ComparisonTargetSelection,
} from "./statement-comparison-model";
import type {
  ComparisonMappingProposalDto,
  ComparisonRunDetailDto,
  ComparisonRunLineDto,
  ComparisonTargetPreviewDto,
} from "./statement-comparison-types";

/**
 * 差异诊断 Surface builders（Package 7）：全部声明式 PageSurface/BodySurface/
 * table/fields/metrics 原语；无 raw JSX、无 action 列、无 expandedRowContent。
 */

export function amountCell(value: string | null): DataSurfaceCellSpec {
  if (value === null) return { kind: "text", value: "—", tone: "muted" };
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return { kind: "text", value };
  return { kind: "amount", value: parsed };
}

export function fingerprintText(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 16 ? `${value.slice(0, 16)}…` : value;
}

// ─── 目标选择工具栏 ─────────────────────────────────────────────────

export function buildComparisonTargetToolbarItems(input: {
  selection: ComparisonTargetSelection | null;
  targetKind: string;
  companyOptions: { value: string; label: string }[];
  batchOptions: { value: string; label: string }[];
  reportType: string;
  periodKind: string;
  year: string;
  month: string;
  previewLoading: boolean;
  onTargetKindChange: (kind: string) => void;
  onCompanyChange: (companyCode: string) => void;
  onYearChange: (year: string) => void;
  onMonthChange: (month: string) => void;
  onPeriodKindChange: (periodKind: string) => void;
  onReportTypeChange: (reportType: string) => void;
  onBatchChange: (batchId: string) => void;
  onPreview: () => void;
}): SurfaceToolbarItems {
  const yearOptions = Array.from({ length: 11 }, (_, index) => {
    const year = new Date().getFullYear() - 5 + index;
    return { value: String(year), label: `${year}年` };
  });
  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: `${index + 1}月`,
  }));
  const items: SurfaceToolbarItems = [
    {
      kind: "select",
      key: "comparison-target-kind",
      label: "对比对象",
      options: [...COMPARISON_TARGET_KIND_OPTIONS],
      value: input.targetKind,
      onChange: input.onTargetKindChange,
    },
  ];
  if (input.targetKind === "entity") {
    items.push(
      {
        kind: "select",
        key: "comparison-company",
        label: "公司",
        options: input.companyOptions,
        value: input.selection?.kind === "entity" ? input.selection.companyCode : "",
        onChange: input.onCompanyChange,
        placeholder: "选择公司",
      },
      { kind: "select", key: "comparison-year", label: "年度", options: yearOptions, value: input.year, onChange: input.onYearChange },
      { kind: "select", key: "comparison-month", label: "月份", options: monthOptions, value: input.month, onChange: input.onMonthChange },
      {
        kind: "select",
        key: "comparison-period-kind",
        label: "期间口径",
        options: [...COMPARISON_PERIOD_KIND_OPTIONS],
        value: input.periodKind,
        onChange: input.onPeriodKindChange,
      },
    );
  } else {
    items.push({
      kind: "select",
      key: "comparison-batch",
      label: "合并批次",
      options: input.batchOptions,
      value: input.selection?.kind === "consolidated" ? String(input.selection.batchId) : "",
      onChange: input.onBatchChange,
      placeholder: "选择批次",
    });
  }
  items.push(
    {
      kind: "select",
      key: "comparison-report-type",
      label: "报表类型",
      options: COMPARISON_REPORT_TYPE_OPTIONS,
      value: input.reportType,
      onChange: input.onReportTypeChange,
    },
    {
      kind: "action-group",
      key: "comparison-target-actions",
      actions: [{
        key: "preview",
        label: input.previewLoading ? "准备上传中" : "上传 Excel",
        kind: "import",
        variant: "primary",
        disabled: input.previewLoading || !input.selection,
        onClick: input.onPreview,
      }],
    },
  );
  return items;
}

// ─── 目标预览摘要 ───────────────────────────────────────────────────

export function createComparisonPreviewSections(input: {
  preview: ComparisonTargetPreviewDto;
  staleMapping: boolean;
}): BodySurfaceSectionSpec[] {
  const { preview } = input;
  return [createPanelSection("comparison-target-preview", {
    title: "系统报表",
    sections: [
      createMessageSection("comparison-target-preview-meta", {
        tone: "muted",
        content: `${preview.targetLabel} · ${comparisonReportTypeLabel(preview.target.reportType)} · ${preview.currencyCode} · ${preview.lineCount} 行`,
      }),
      ...(input.staleMapping ? [createMessageSection("comparison-target-preview-stale", {
        tone: "warning",
        content: "系统报表已经变化，请重新选择 Excel 报表后再开始对比。",
      })] : []),
    ],
  })];
}

// ─── 上传与既有证据包 ────────────────────────────────────────────────

export function createComparisonUploadSections(input: {
  canImport: boolean;
  uploadFile: File | null;
  uploading: boolean;
  uploadError: string | null;
  onFileChange: (file: File | null) => void;
  onUpload: () => void;
}): BodySurfaceSectionSpec[] {
  if (!input.canImport) {
    return [createMessageSection("comparison-upload-denied", {
      tone: "muted",
      content: "当前账号没有上传 Excel 并发起对比的权限。",
    })];
  }
  const fields: FormSurfaceItemSpec[] = [{
    key: "file",
    label: "Excel 文件（.xlsx，≤ 20 MiB）",
    spec: { valueType: "file", control: "file", state: "required" },
    value: input.uploadFile,
    onChange: (value) => input.onFileChange(value instanceof File ? value : null),
  }];
  return [
    createFieldsSection("comparison-upload-fields", fields, {
      layout: { columns: 1 },
      actions: [{
        key: "upload",
        action: "save",
        label: input.uploading ? "正在读取 Excel" : "上传 Excel",
        disabled: input.uploading || !input.uploadFile,
        onClick: input.onUpload,
      }],
    }),
    ...(input.uploadError ? [createMessageSection("comparison-upload-error", {
      tone: "danger",
      content: input.uploadError,
    })] : []),
  ];
}

// ─── 映射确认 ──────────────────────────────────────────────────────

export function createComparisonMappingSections(input: {
  proposals: ComparisonMappingProposalDto[];
  selectedProposalIndex: number | null;
  choices: ComparisonMappingChoices;
  canUpdate: boolean;
  confirming: boolean;
  remapMode: boolean;
  onProposalChange: (index: number) => void;
  onChoiceChange: (row: number, choice: string) => void;
  onConfirm: () => void;
}): BodySurfaceSectionSpec[] {
  const proposal = input.selectedProposalIndex === null ? null : input.proposals[input.selectedProposalIndex] ?? null;
  const pending = proposal ? pendingComparisonMappingLines(proposal.lines) : [];
  const confirmable = isComparisonMappingConfirmable(proposal, input.choices);
  const proposalFields: FormSurfaceItemSpec[] = [{
    key: "proposal",
    label: "Excel 报表",
    spec: {
      valueType: "string",
      control: "choice",
      state: "required",
      options: {
        source: "static",
        items: input.proposals.map((entry, index) => ({
          value: String(index),
          label: `${entry.structure.sheetName} · ${entry.structure.amountColumns.map((column) => column.headerText || `第 ${column.col + 1} 列`).join(" / ")}`,
        })),
      },
    },
    value: input.selectedProposalIndex === null ? "" : String(input.selectedProposalIndex),
    onChange: (value) => {
      const index = Number(String(value ?? ""));
      if (Number.isInteger(index)) input.onProposalChange(index);
    },
  }];
  const choiceFields: FormSurfaceItemSpec[] = pending.map((line) => ({
    key: `mapping-row-${line.row}`,
    label: `${line.label}（${line.labelCell} · ${comparisonMappingLineStatusLabel(line.status)}）`,
    spec: {
      valueType: "string",
      control: "choice",
      state: "required",
      options: {
        source: "static",
        items: [
          ...line.candidates.map((candidate) => ({ value: candidate, label: candidate })),
          { value: COMPARISON_MAPPING_SKIP, label: "跳过：不作为报表行对比" },
        ],
      },
    },
    value: input.choices[line.row] ?? "",
    onChange: (value) => input.onChoiceChange(line.row, String(value ?? "")),
  }));
  return [createPanelSection("comparison-mapping-confirm", {
      title: input.remapMode ? "重新选择 Excel 报表" : "选择 Excel 中要对比的报表",
      sections: [
        createFieldsSection("comparison-proposal-field", proposalFields, { layout: { columns: 1 } }),
        ...(proposal && proposal.missingLines.length > 0 ? [createMessageSection("comparison-missing-lines", {
          tone: "warning",
          content: `Excel 中缺少 ${proposal.missingLines.length} 个系统报表项目：${proposal.missingLines.slice(0, 5).map((line) => line.label).join("、")}${proposal.missingLines.length > 5 ? "…" : ""}`,
        })] : []),
        ...(pending.length > 0 ? [createFieldsSection("comparison-mapping-choices", choiceFields, {
          layout: { columns: 1 },
          actions: [{
            key: "confirm",
            action: "save",
            label: input.confirming ? "正在开始对比" : "开始对比",
            disabled: input.confirming || !confirmable || !input.canUpdate,
            onClick: input.onConfirm,
          }],
        })] : [createFieldsSection("comparison-mapping-confirm-action", [], {
          layout: { columns: 1 },
          actions: [{
            key: "confirm",
            action: "save",
            label: input.confirming ? "正在开始对比" : "开始对比",
            disabled: input.confirming || !confirmable || !proposal || !input.canUpdate,
            onClick: input.onConfirm,
          }],
        })]),
        ...(pending.length > 0 && !confirmable ? [createMessageSection("comparison-mapping-blocked", {
          tone: "warning",
          content: `仍有 ${pending.filter((line) => !input.choices[line.row]).length} 个 Excel 项目无法自动对应，请先选择对应的系统报表项目。`,
        })] : []),
        ...(!input.canUpdate ? [createMessageSection("comparison-mapping-no-update", {
          tone: "muted",
          content: "当前账号没有选择 Excel 报表项目并开始对比的权限。",
        })] : []),
      ],
    })];
}
// ─── 结果汇总与过滤 ─────────────────────────────────────────────────

export function createComparisonSummarySection(
  summary: ComparisonRunDetailDto["summary"],
): BodySurfaceSectionSpec {
  if (!summary) {
    return createEmptySection("comparison-summary-empty", { content: "本次运行没有汇总指标" });
  }
  const metrics = comparisonSummaryMetrics(summary).map((metric) => ({
    key: metric.key,
    label: metric.label,
    value: { kind: "text" as const, value: metric.value, tone: metric.tone, emphasis: "strong" as const },
  }));
  return createMetricsSection("comparison-summary", { metrics });
}

export function buildComparisonResultFilterToolbarItems(input: {
  onlyDifferences: boolean;
  status: string;
  absThreshold: string;
  query: string;
  onOnlyDifferencesChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onAbsThresholdChange: (value: string) => void;
  onQueryChange: (value: string) => void;
}): SurfaceToolbarItems {
  return [
    {
      kind: "search",
      key: "comparison-line-query",
      value: input.query,
      onChange: input.onQueryChange,
      placeholder: "搜索报表项目 / 科目 / 来源",
    },
    {
      kind: "select",
      key: "comparison-line-scope",
      label: "行范围",
      options: [
        { value: "all", label: "全部行" },
        { value: "differing", label: "仅差异行" },
      ],
      value: input.onlyDifferences ? "differing" : "all",
      onChange: input.onOnlyDifferencesChange,
    },
    {
      kind: "select",
      key: "comparison-line-status",
      label: "解释状态",
      options: [
        { value: "all", label: "全部状态" },
        ...["exact", "near", "ambiguous", "notFound", "truncated", "notEvaluated"].map((status) => ({
          value: status,
          label: comparisonExplanationStatusLabel(status),
        })),
      ],
      value: input.status,
      onChange: input.onStatusChange,
    },
    {
      kind: "select",
      key: "comparison-line-threshold",
      label: "|差异| 阈值",
      options: [
        { value: "", label: "不限" },
        { value: "0.01", label: "≥ 0.01" },
        { value: "100", label: "≥ 100" },
        { value: "10000", label: "≥ 10,000" },
      ],
      value: input.absThreshold,
      onChange: input.onAbsThresholdChange,
    },
  ];
}

// ─── 结果表格（整行选中；无 action 列）──────────────────────────────

export function buildComparisonResultColumns(
  selectedLineCode: string | null,
): DataSurfaceColumnSpec<ComparisonRunLineDto>[] {
  const cellSelected = (row: ComparisonRunLineDto) => row.lineCode === selectedLineCode;
  return [
    { key: "lineLabel", label: "报表项目", required: true, width: "xl", cellSelected, cell: (row) => ({ kind: "text", value: row.lineLabel, emphasis: "medium" }) },
    { key: "externalAmount", label: "Excel 金额", width: "md", align: "right", cellSelected, cell: (row) => amountCell(row.externalAmount) },
    { key: "systemAmount", label: "系统金额", width: "md", align: "right", cellSelected, cell: (row) => amountCell(row.systemAmount) },
    {
      key: "differenceAmount",
      label: "差异",
      width: "md",
      align: "right",
      cellSelected,
      cell: (row) => {
        const cell = amountCell(row.differenceAmount);
        if (cell.kind === "amount" && row.differenceAmount !== null && Number(row.differenceAmount) !== 0) {
          return { kind: "text", value: row.differenceAmount, tone: "danger", emphasis: "strong" };
        }
        return cell;
      },
    },
    { key: "explanationStatus", label: "解释状态", width: "md", cellSelected, cell: (row) => ({ kind: "text", value: comparisonExplanationStatusLabel(row.explanationStatus), tone: comparisonExplanationStatusTone(row.explanationStatus) }) },
    { key: "bestSource", label: "最佳来源", width: "xl", cellSelected, cell: (row) => ({ kind: "text", value: comparisonBestSourceLabel(row), tone: row.evidence.length > 0 ? "default" : "muted", maxChars: 60 }) },
  ];
}
