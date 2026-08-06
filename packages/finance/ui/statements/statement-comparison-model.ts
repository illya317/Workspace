import { matchText } from "@workspace/core/search";
import type { StatementReportType } from "@workspace/finance/types";

import type {
  ComparisonLineMappingEntryDto,
  ComparisonMappingProposalDto,
  ComparisonPackageDetailDto,
  ComparisonPackageListItemDto,
  ComparisonReportType,
  ComparisonRunDetailDto,
  ComparisonRunLineDto,
  ComparisonRunSummaryDto,
  ComparisonTargetPreviewDto,
} from "./statement-comparison-types";
import type { StatementComparisonLaunchContext } from "./statement-ui-types";

/**
 * 差异诊断纯模型（Package 7）：状态机、过滤器、汇总指标、映射确认。
 * 无 fetch/React 依赖，全部可单测。
 */

// ─── 选项与词表 ─────────────────────────────────────────────────────

export const COMPARISON_TARGET_KIND_OPTIONS = [
  { value: "entity", label: "单体报表" },
  { value: "consolidated", label: "合并报表" },
] as const;

export const COMPARISON_REPORT_TYPE_OPTIONS: { value: ComparisonReportType; label: string }[] = [
  { value: "balance", label: "资产负债表" },
  { value: "income", label: "利润表" },
  { value: "cashflow", label: "现金流量表" },
];

export const COMPARISON_PERIOD_KIND_OPTIONS = [
  { value: "monthly", label: "当月" },
  { value: "cumulative", label: "本年累计" },
] as const;

/** 合并报表 tab 的报表类型词表 → 对比目标词表。 */
export function mapConsolidatedReportType(reportType: StatementReportType): ComparisonReportType {
  switch (reportType) {
    case "incomeStatement": return "income";
    case "cashFlow": return "cashflow";
    default: return "balance";
  }
}

/** 单体报表 periodKind（month=当月；year/quarter 视角对比一律按累计口径）。 */
export function mapEntityPeriodKind(periodKind: string): "monthly" | "cumulative" {
  return periodKind === "month" ? "monthly" : "cumulative";
}

export function comparisonReportTypeLabel(reportType: string): string {
  return COMPARISON_REPORT_TYPE_OPTIONS.find((option) => option.value === reportType)?.label ?? reportType;
}

export function comparisonLifecycleLabel(lifecycle: string): string {
  return ({
    parsed: "已解析",
    mappingRequired: "待确认映射",
    ready: "就绪",
    failed: "解析失败",
    archived: "已归档",
  } as Record<string, string>)[lifecycle] ?? lifecycle;
}

export function comparisonRunStatusLabel(status: string): string {
  return ({
    running: "执行中",
    completed: "已完成",
    failed: "失败",
  } as Record<string, string>)[status] ?? status;
}

export function comparisonExplanationStatusLabel(status: string): string {
  return ({
    exact: "精确解释",
    near: "近似解释",
    ambiguous: "歧义",
    notFound: "未解释",
    truncated: "被截断",
    notEvaluated: "未评估",
  } as Record<string, string>)[status] ?? status;
}

export type ComparisonTone = "default" | "success" | "warning" | "danger" | "muted";

export function comparisonExplanationStatusTone(status: string): ComparisonTone {
  switch (status) {
    case "exact": return "success";
    case "near": return "default";
    case "ambiguous": return "warning";
    case "notFound": return "danger";
    case "truncated": return "warning";
    default: return "muted";
  }
}

export function comparisonMappingLineStatusLabel(status: string): string {
  return ({
    auto_accepted: "自动匹配",
    ambiguous: "歧义待确认",
    duplicate: "重复待确认",
    unmatched: "未匹配",
  } as Record<string, string>)[status] ?? status;
}

// ─── target-preview 查询 ────────────────────────────────────────────

export type ComparisonTargetSelection =
  | {
      kind: "entity";
      companyCode: string;
      year: number;
      month: number;
      periodKind: "monthly" | "cumulative";
      reportType: ComparisonReportType;
    }
  | {
      kind: "consolidated";
      batchId: number;
      reportType: ComparisonReportType;
    };

/** launch context → 目标选择（预填，不含指纹；指纹经 target-preview 解析）。 */
export function selectionFromLaunchContext(
  context: StatementComparisonLaunchContext,
): ComparisonTargetSelection {
  if (context.kind === "entity") {
    return {
      kind: "entity",
      companyCode: context.companyCode,
      year: context.year,
      month: context.month,
      periodKind: context.periodKind,
      reportType: context.reportType,
    };
  }
  return { kind: "consolidated", batchId: context.batchId, reportType: context.reportType };
}

export function buildTargetPreviewQuery(selection: ComparisonTargetSelection): string {
  const params = new URLSearchParams();
  if (selection.kind === "entity") {
    params.set("kind", "entity");
    params.set("companyCode", selection.companyCode);
    params.set("year", String(selection.year));
    params.set("month", String(selection.month));
    params.set("periodKind", selection.periodKind);
    params.set("reportType", selection.reportType);
  } else {
    params.set("kind", "consolidated");
    params.set("batchId", String(selection.batchId));
    params.set("reportType", selection.reportType);
  }
  return params.toString();
}

// ─── 七种 UI 状态 ───────────────────────────────────────────────────

export type ComparisonUiState =
  | "empty"
  | "targetReady"
  | "parsing"
  | "mappingRequired"
  | "ready"
  | "completed"
  | "failed";

export function deriveComparisonUiState(input: {
  preview: ComparisonTargetPreviewDto | null;
  uploading: boolean;
  uploadError: string | null;
  packageDetail: ComparisonPackageDetailDto | null;
  runDetail: ComparisonRunDetailDto | null;
}): ComparisonUiState {
  if (input.uploading) return "parsing";
  if (!input.preview) return "empty";
  if (input.uploadError) return "failed";
  if (input.runDetail) {
    return input.runDetail.status === "completed" ? "completed" : "failed";
  }
  const detail = input.packageDetail;
  if (!detail) return "targetReady";
  if (detail.lifecycle === "failed") return "failed";
  if (detail.lifecycle === "mappingRequired" || detail.lifecycle === "parsed") return "mappingRequired";
  return "ready";
}

/** 映射绑定的目标指纹与当前系统目标指纹不一致即 stale（安全重试=新建 run）。 */
export function isComparisonMappingStale(
  mapping: { targetFingerprint: string } | null,
  preview: ComparisonTargetPreviewDto | null,
): boolean {
  if (!mapping || !preview) return false;
  return mapping.targetFingerprint !== preview.target.targetFingerprint;
}

// ─── 汇总指标（绝不宣称「已对账」）─────────────────────────────────

/** 存在歧义/未解释/截断行时为 true；此时任何「已对账/reconciled」表述都被禁止。 */
export function hasUnresolvedComparisonResults(summary: ComparisonRunSummaryDto): boolean {
  return summary.ambiguous > 0 || summary.notFound > 0 || summary.truncated > 0;
}

export interface ComparisonSummaryMetric {
  key: string;
  label: string;
  value: string;
  tone: ComparisonTone;
}

export function comparisonSummaryMetrics(summary: ComparisonRunSummaryDto): ComparisonSummaryMetric[] {
  const unresolved = hasUnresolvedComparisonResults(summary);
  return [
    { key: "total", label: "报表行", value: String(summary.totalLines), tone: "default" },
    { key: "differing", label: "差异行", value: String(summary.differingLines), tone: summary.differingLines > 0 ? "warning" : "default" },
    { key: "exact", label: "精确解释", value: String(summary.exact), tone: "success" },
    { key: "ambiguous", label: "歧义", value: String(summary.ambiguous), tone: summary.ambiguous > 0 ? "warning" : "muted" },
    { key: "notFound", label: "未解释", value: String(summary.notFound), tone: summary.notFound > 0 ? "danger" : "muted" },
    { key: "truncated", label: "被截断", value: String(summary.truncated), tone: summary.truncated > 0 ? "warning" : "muted" },
    {
      key: "residual",
      label: "|未解释残差| 合计",
      value: summary.totalAbsoluteResidual,
      tone: unresolved ? "warning" : "default",
    },
  ];
}

// ─── 结果过滤 ──────────────────────────────────────────────────────

export interface ComparisonLineFilter {
  onlyDifferences: boolean;
  /** "all" 或 explanationStatus。 */
  status: string;
  /** |差异| 阈值（元）；空字符串 = 不限。 */
  absThreshold: string;
  /** 文本/科目/来源查询。 */
  query: string;
}

export const EMPTY_COMPARISON_LINE_FILTER: ComparisonLineFilter = {
  onlyDifferences: false,
  status: "all",
  absThreshold: "",
  query: "",
};

function numericAmount(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function filterComparisonLines(
  lines: readonly ComparisonRunLineDto[],
  filter: ComparisonLineFilter,
): ComparisonRunLineDto[] {
  const threshold = filter.absThreshold.trim() ? Number(filter.absThreshold) : null;
  const query = filter.query.trim();
  return lines.filter((line) => {
    const difference = numericAmount(line.differenceAmount);
    if (filter.onlyDifferences && (difference === null || difference === 0)) return false;
    if (filter.status !== "all" && line.explanationStatus !== filter.status) return false;
    if (threshold !== null && Number.isFinite(threshold)) {
      if (difference === null || Math.abs(difference) < threshold) return false;
    }
    if (query) {
      const haystack = [
        line.lineLabel,
        line.lineCode,
        ...line.evidence.map((evidence) => evidence.label),
        ...line.evidence.map((evidence) => evidence.account?.code ?? ""),
        ...line.evidence.map((evidence) => evidence.account?.name ?? ""),
        ...line.evidence.map((evidence) => evidence.sourceKind),
      ].join("\n");
      if (!matchText(haystack, query)) return false;
    }
    return true;
  });
}

/** 行的最佳来源展示：第一条证据 label。 */
export function comparisonBestSourceLabel(line: ComparisonRunLineDto): string {
  return line.evidence[0]?.label ?? "—";
}

// ─── 映射确认 ──────────────────────────────────────────────────────

/** 每个待处置行（ambiguous/duplicate）的用户选择：lineCode 或 "__skip__"。 */
export type ComparisonMappingChoices = Record<number, string>;

export const COMPARISON_MAPPING_SKIP = "__skip__";

export function pendingComparisonMappingLines(
  lines: readonly ComparisonLineMappingEntryDto[],
): ComparisonLineMappingEntryDto[] {
  return lines.filter((line) => line.status === "ambiguous" || line.status === "duplicate");
}

/** ambiguous/duplicate 全部处置后才允许确认（与服务端 validateComparisonMappingConfirmation 一致）。 */
export function isComparisonMappingConfirmable(
  proposal: ComparisonMappingProposalDto | null,
  choices: ComparisonMappingChoices,
): boolean {
  if (!proposal) return false;
  return pendingComparisonMappingLines(proposal.lines)
    .every((line) => Boolean(choices[line.row]));
}

/** 应用用户选择：歧义/重复行改为 auto_accepted（选定 lineCode）或 unmatched（跳过）。 */
export function resolveComparisonLineMapping(
  lines: readonly ComparisonLineMappingEntryDto[],
  choices: ComparisonMappingChoices,
): ComparisonLineMappingEntryDto[] {
  return lines.map((line) => {
    if (line.status !== "ambiguous" && line.status !== "duplicate") return line;
    const choice = choices[line.row];
    if (!choice) return line;
    if (choice === COMPARISON_MAPPING_SKIP) {
      return { ...line, status: "unmatched" as const, lineCode: null, candidates: [] };
    }
    return { ...line, status: "auto_accepted" as const, lineCode: choice, candidates: [] };
  });
}

// ─── 证据包选择 ────────────────────────────────────────────────────

/** 可选择的证据包：未归档（失败的也列出用于展示精确错误）。 */
export function selectableComparisonPackages(
  packages: readonly ComparisonPackageListItemDto[],
): ComparisonPackageListItemDto[] {
  return packages.filter((item) => item.lifecycle !== "archived");
}

/** 证据包绑定当前目标且已有确认映射时返回最新映射，否则 null。 */
export function confirmedMappingForTarget(
  detail: ComparisonPackageDetailDto | null,
  preview: ComparisonTargetPreviewDto | null,
): ComparisonPackageDetailDto["mappings"][number] | null {
  if (!detail || !preview) return null;
  const targetKind = preview.target.kind;
  const reportType = preview.target.reportType;
  const candidates = detail.mappings.filter((mapping) => (
    mapping.targetKind === targetKind
    && mapping.reportType === reportType
    && mapping.targetFingerprint === preview.target.targetFingerprint
  ));
  return candidates[0] ?? null;
}

export const MAX_COMPARISON_UPLOAD_BYTES = 20 * 1024 * 1024;

/** 客户端预检（服务端 envelope/preflight 仍是权威）。 */
export function validateComparisonUploadFile(file: File | null): string | null {
  if (!file) return "请选择 .xlsx 工作簿文件";
  if (!file.name.toLowerCase().endsWith(".xlsx")) return "仅支持 .xlsx 工作簿";
  if (file.size <= 0) return "文件不能为空";
  if (file.size > MAX_COMPARISON_UPLOAD_BYTES) return "文件超过 20 MiB 上限";
  return null;
}
