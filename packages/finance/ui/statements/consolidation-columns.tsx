import type { DataSurfaceColumnSpec, DataSurfaceDisplaySpec } from "@workspace/core/ui";
import type {
  ConsolidationEntityCoverage,
  ConsolidationInvestmentEvidence,
  ConsolidationReadinessCheck,
  StatementExchangeRateSnapshot,
  StatementSourceCoverage,
} from "@workspace/finance/types";

function statusBadge(status: ConsolidationReadinessCheck["status"]): DataSurfaceDisplaySpec {
  if (status === "ready") return { kind: "badge", label: "已就绪", tone: "green" };
  if (status === "attention") return { kind: "badge", label: "需复核", tone: "amber" };
  return { kind: "badge", label: "阻断", tone: "red" };
}

function sourceCell(source: StatementSourceCoverage): DataSurfaceDisplaySpec {
  const tone = source.kind === "missing"
    ? "red"
    : source.status === "submitted"
      ? "green"
      : "amber";
  return {
    kind: "stack",
    gap: "xs",
    items: [
      { kind: "badge", label: source.label, tone },
      { kind: "text", value: source.detail, tone: "muted", wrap: "wrap" },
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
      kind: "stack",
      gap: "xs",
      items: [
        { kind: "text", value: row.name, emphasis: "medium", wrap: "wrap" },
        { kind: "text", value: row.parentCode ? `${row.parentCode} → ${row.code} · ${row.role}` : `${row.code} · ${row.role}`, tone: "muted" },
      ],
    }),
  },
  {
    key: "ownership",
    label: "持股比例",
    required: true,
    width: "sm",
    cell: (row) => row.shareRatio === null
      ? { kind: "badge", label: "未维护", tone: "red" }
      : `${(row.shareRatio * 100).toFixed(2)}%`,
  },
  { key: "balance", label: "资产负债表", required: true, width: "xl", cell: (row) => sourceCell(row.balanceSheet) },
  { key: "income", label: "利润表", required: true, width: "xl", cell: (row) => sourceCell(row.incomeStatement) },
  { key: "cash-flow", label: "现金流量表", required: true, width: "xl", cell: (row) => sourceCell(row.cashFlow) },
  { key: "status", label: "合并就绪", required: true, width: "sm", cell: (row) => statusBadge(row.status) },
];

const RATE_KIND_LABELS: Record<StatementExchangeRateSnapshot["rateKind"], string> = {
  closing: "期末折算价",
  historicalInvestment: "投资日历史汇率",
  average: "期间平均汇率",
};

export const exchangeRateColumns: DataSurfaceColumnSpec<StatementExchangeRateSnapshot>[] = [
  { key: "version", label: "版本", width: "xs", cell: (row) => `v${row.version}` },
  { key: "kind", label: "汇率口径", required: true, width: "md", cell: (row) => RATE_KIND_LABELS[row.rateKind] },
  { key: "date", label: "牌价日期", required: true, width: "sm", cell: (row) => row.rateDate },
  { key: "rate", label: "中行折算价", required: true, width: "sm", cell: (row) => ({ kind: "number", value: row.rate, minimumFractionDigits: 4, maximumFractionDigits: 8 }) },
  { key: "unit", label: "单位", width: "md", cell: () => "人民币/100外币" },
  { key: "published", label: "牌价发布时间", width: "lg", cell: (row) => row.publishedAt ? new Date(row.publishedAt).toLocaleString("zh-CN", { hour12: false }) : "未填写" },
  { key: "status", label: "复核状态", required: true, width: "sm", cell: (row) => ({ kind: "badge", label: row.status === "verified" ? "已复核" : "草稿", tone: row.status === "verified" ? "green" : "amber" }) },
  { key: "note", label: "说明", width: "xl", cell: (row) => row.note || "—" },
];

export const investmentEvidenceColumns: DataSurfaceColumnSpec<ConsolidationInvestmentEvidence>[] = [
  { key: "date", label: "投资日期", required: true, width: "sm", cell: (row) => row.voucherDate },
  { key: "voucher", label: "凭证", required: true, width: "md", cell: (row) => `${row.companyCode} · ${row.voucherNo}` },
  { key: "description", label: "投资事实", required: true, width: "xl", cell: (row) => row.description },
  { key: "booked", label: "人民币入账", width: "md", cell: (row) => ({ kind: "amount", value: row.bookedAmountCny, minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  { key: "original", label: "原币金额", width: "md", cell: (row) => row.originalAmount === null ? "未保留" : `${row.currencyCode || "外币"} ${row.originalAmount.toLocaleString("zh-CN")}` },
  { key: "rate", label: "投资日汇率", width: "md", cell: (row) => row.transactionRate === null ? "未保留" : row.transactionRate.toFixed(8) },
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
