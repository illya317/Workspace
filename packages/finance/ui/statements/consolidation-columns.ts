import type {
  DataSurfaceCellSpec,
  DataSurfaceColumnSpec,
  DataSurfaceDisplaySpec,
} from "@workspace/core/ui";
import type {
  ConsolidationAdjustmentComparison,
  ConsolidationEntityCoverage,
  ConsolidationInvestmentEvidence,
  ConsolidationReadinessCheck,
  StatementSourceCoverage,
} from "@workspace/finance/types";

import type { ExchangeRateSummaryRow } from "./consolidation-fx-summary";

function comparisonSide(
  company: string,
  account: string,
  direction: "借" | "贷" | "—",
  amount: number,
): DataSurfaceDisplaySpec {
  return {
    kind: "stack",
    gap: "xs",
    items: [
      { kind: "text", value: company, emphasis: "medium", wrap: "wrap" },
      { kind: "text", value: `${account} · ${direction === "—" ? "无余额" : `${direction}方余额`}`, tone: "muted", wrap: "wrap" },
      { kind: "amount", value: amount },
    ],
  };
}

type AdjustmentSource = ConsolidationAdjustmentComparison["leftSources"][number];

type AdjustmentSourcePairRow = {
  index: number;
  left: AdjustmentSource | null;
  right: AdjustmentSource | null;
};

function sourceVoucherCell(source: AdjustmentSource | null): DataSurfaceCellSpec {
  if (!source) return { kind: "empty", content: "—" };
  return { kind: "group", direction: "column", items: [
    { kind: "text", value: source.voucherNo, emphasis: "medium", wrap: "wrap" },
    { kind: "text", value: `${source.accountCode} ${source.accountName}${source.description ? ` · ${source.description}` : ""}`, tone: "muted", wrap: "wrap" },
    { kind: "group", items: [
      { kind: "badge", label: source.direction, tone: "gray" },
      { kind: "amount", value: source.amount },
      { kind: "text", value: source.currencyCode, tone: "muted" },
    ] },
    ...(source.consolidationAmountCny === undefined ? [] : [{
      kind: "text" as const,
      value: `抵销折合 CNY ${source.consolidationAmountCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      tone: "muted" as const,
    }]),
  ] };
}

export function adjustmentComparisonExpandedRow(row: ConsolidationAdjustmentComparison): DataSurfaceCellSpec {
  const leftHistoricalSourceCount = row.leftHistoricalSourceCount ?? 0;
  const rightHistoricalSourceCount = row.rightHistoricalSourceCount ?? 0;
  const rows: AdjustmentSourcePairRow[] = Array.from({
    length: Math.max(row.leftSources.length, row.rightSources.length),
  }, (_, index) => ({
    index,
    left: row.leftSources[index] ?? null,
    right: row.rightSources[index] ?? null,
  }));
  const columns: DataSurfaceColumnSpec<AdjustmentSourcePairRow>[] = [
    { key: "left", label: `账面一｜${row.leftCompany}`, required: true, cell: (source) => sourceVoucherCell(source.left) },
    { key: "right", label: `账面二｜${row.rightCompany}`, required: true, cell: (source) => sourceVoucherCell(source.right) },
  ];
  return { kind: "group", direction: "column", items: [
    { kind: "text", value: row.sourceDisplayNote || "勾稽计算覆盖成立以来截至本期的全部凭证；下表仅显示当前选择年度。", tone: "muted", wrap: "wrap" },
    ...((leftHistoricalSourceCount > 0 || rightHistoricalSourceCount > 0) ? [{
      kind: "text" as const,
      value: `已折叠以前年度凭证：账面一 ${leftHistoricalSourceCount} 笔，账面二 ${rightHistoricalSourceCount} 笔。`,
      tone: "muted" as const,
      wrap: "wrap" as const,
    }] : []),
    { kind: "data", data: {
      kind: "table",
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (source) => source.index,
      presentation: { density: "compact", cellWrap: "wrap", header: "plain" },
      scroll: { y: "hidden" },
      emptyText: "暂无来源凭证明细",
    } },
  ] };
}

type AdjustmentComparisonColumnInput = {
  expandedKeys: Set<string>;
};

function comparisonReviewCell(
  row: ConsolidationAdjustmentComparison,
): DataSurfaceCellSpec {
  const label = row.reviewStatus === "approved" ? "已通过"
    : row.reviewStatus === "returned" ? "已退回"
      : row.reviewStatus === "exception" ? "例外（不阻断）" : row.entryId ? "待审阅" : "正在生成";
  const tone = row.reviewStatus === "approved" ? "green"
    : row.reviewStatus === "returned" ? "red" : "amber";
  const entryLines = row.entrySummary.split("；").filter(Boolean).map((line) => ({
    kind: "text" as const,
    value: line,
    tone: row.status === "equal" ? "default" as const : "muted" as const,
    wrap: "wrap" as const,
  }));
  return { kind: "group", direction: "column", items: [
    { kind: "group", items: [
      { kind: "text", value: "差额", tone: "muted", emphasis: "medium" },
      { kind: "amount", value: row.difference },
    ] },
    { kind: "text", value: "拟抵销分录", tone: "muted", emphasis: "medium" },
    ...entryLines,
    { kind: "badge", label, tone },
  ] };
}

export function createAdjustmentComparisonColumns(
  input: AdjustmentComparisonColumnInput,
): DataSurfaceColumnSpec<ConsolidationAdjustmentComparison>[] {
  return [
  { key: "entry", label: "事项", required: true, cell: (row) => ({ kind: "stack", gap: "xs", items: [
    { kind: "disclosure", label: row.title, expanded: input.expandedKeys.has(row.key), emphasis: "medium" },
    { kind: "text", value: `${row.displayPeriodLabel || "本期"}：账面一 ${row.leftSources.length} 笔，账面二 ${row.rightSources.length} 笔；以前年度各 ${row.leftHistoricalSourceCount ?? 0} / ${row.rightHistoricalSourceCount ?? 0} 笔已折叠`, tone: "muted" },
  ] }) },
  { key: "left", label: "账面一", required: true, cell: (row) => comparisonSide(
    row.leftCompany, row.leftAccount, row.leftDirection, row.leftAmount,
  ) },
  { key: "right", label: "账面二", required: true, cell: (row) => comparisonSide(
    row.rightCompany, row.rightAccount, row.rightDirection, row.rightAmount,
  ) },
  { key: "review", label: "抵销与审阅", required: true, cell: (row) => comparisonReviewCell(row) },
  ];
}

function statusBadge(status: ConsolidationReadinessCheck["status"]): DataSurfaceDisplaySpec {
  if (status === "ready") return { kind: "badge", label: "已就绪", tone: "green" };
  if (status === "attention") return { kind: "badge", label: "需复核", tone: "amber" };
  return { kind: "badge", label: "未就绪", tone: "red" };
}

export function sourceCoverageTone(source: StatementSourceCoverage) {
  if (source.kind === "missing") return "red" as const;
  return "green" as const;
}

function sourceCell(source: StatementSourceCoverage): DataSurfaceDisplaySpec {
  return {
    kind: "stack",
    gap: "xs",
    items: [
      { kind: "badge", label: source.label, tone: sourceCoverageTone(source) },
      ...(source.detail ? [{ kind: "text" as const, value: source.detail, tone: "muted" as const, wrap: "wrap" as const }] : []),
    ],
  };
}

export const consolidationEntityColumns: DataSurfaceColumnSpec<ConsolidationEntityCoverage>[] = [
  {
    key: "company",
    label: "合并主体",
    required: true,
    width: "lg",
    cell: (row) => ({
      kind: "group",
      direction: "column",
      items: [
        { kind: "group", items: [
          { kind: "text", value: row.name, title: row.fullName || row.name, emphasis: "medium" },
          { kind: "badge", label: row.shareRatio === null ? "持股未维护" : `持股 ${(row.shareRatio * 100).toFixed(2)}%`, tone: row.shareRatio === null ? "red" : "gray" },
        ] },
        { kind: "text", value: row.parentName ? `${row.parentName} → ${row.name} · ${row.role}` : row.role, tone: "muted" },
      ],
    }),
  },
  { key: "balance", label: "资产负债表", required: true, width: "xl", cell: (row) => sourceCell(row.balanceSheet) },
  { key: "income", label: "利润表", required: true, width: "xl", cell: (row) => sourceCell(row.incomeStatement) },
  { key: "cash-flow", label: "现金流量表", required: true, width: "xl", cell: (row) => sourceCell(row.cashFlow) },
];

export const exchangeRateSummaryColumns: DataSurfaceColumnSpec<ExchangeRateSummaryRow>[] = [
  { key: "pair", label: "币种对", required: true, width: "md", emphasis: "medium", cell: (row) => ({ kind: "text", value: row.pair, font: "mono", emphasis: "strong" }) },
  { key: "current", label: "本期期末", required: true, width: "lg", cell: (row) => row.current ? ({ kind: "stack", gap: "xs", items: [
    { kind: "text", value: row.current.rate, font: "mono", emphasis: "strong" },
    { kind: "text", value: row.current.rateDate === row.currentTargetDate ? row.current.rateDate : `目标 ${row.currentTargetDate} · 采用 ${row.current.rateDate} 牌价`, tone: "muted" },
  ] }) : ({ kind: "badge", label: `缺少 ${row.currentTargetDate} 适用牌价`, tone: "red" }) },
  { key: "comparative", label: "比较期期末", required: true, width: "lg", cell: (row) => row.comparative ? ({ kind: "stack", gap: "xs", items: [
    { kind: "text", value: row.comparative.rate, font: "mono", emphasis: "strong" },
    { kind: "text", value: row.comparative.rateDate === row.comparativeTargetDate ? row.comparative.rateDate : `目标 ${row.comparativeTargetDate} · 采用 ${row.comparative.rateDate} 牌价`, tone: "muted" },
  ] }) : ({ kind: "badge", label: `缺少 ${row.comparativeTargetDate} 适用牌价`, tone: "red" }) },
  { key: "source", label: "来源", required: true, width: "lg", cell: (row) => ({ kind: "stack", gap: "xs", items: [
    { kind: "link", label: row.source.name, href: row.source.url, external: true },
    { kind: "text", value: row.source.field, tone: "muted" },
  ] }) },
];

export const investmentEvidenceColumns: DataSurfaceColumnSpec<ConsolidationInvestmentEvidence>[] = [
  { key: "date", label: "投资日期", required: true, width: "sm", cell: (row) => row.voucherDate },
  { key: "voucher", label: "凭证", required: true, width: "md", cell: (row) => `${row.companyCode} · ${row.voucherNo}` },
  { key: "description", label: "投资事实", required: true, width: "xl", cell: (row) => row.description },
  { key: "booked", label: "人民币入账", width: "md", cell: (row) => ({ kind: "amount", value: row.bookedAmountCny, minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  { key: "original", label: "原币金额", width: "md", cell: (row) => row.originalAmount === null ? "未保留" : `${row.currencyCode || "外币"} ${row.originalAmount.toLocaleString("zh-CN")}` },
  { key: "rate", label: "投资日汇率", width: "md", cell: (row) => row.transactionRate === null ? "未保留" : `${row.currencyCode || "外币"}/CNY = ${row.transactionRate}` },
  { key: "status", label: "证据状态", required: true, width: "md", cell: (row) => ({
    kind: "badge",
    label: row.rateStatus === "recorded" ? "凭证已记录" : row.rateStatus === "missingRate" ? "缺投资日汇率" : "缺原币金额",
    tone: row.rateStatus === "recorded" ? "green" : "red",
  }) },
];

export const consolidationCheckColumns: DataSurfaceColumnSpec<ConsolidationReadinessCheck>[] = [
  { key: "label", label: "合并控制点", required: true, width: "lg", emphasis: "medium", cell: (row) => row.label },
  { key: "status", label: "状态", required: true, width: "sm", cell: (row) => statusBadge(row.status) },
  { key: "detail", label: "当前事实 / 下一步", required: true, width: "wide", tone: "muted", cell: (row) => row.detail },
];
