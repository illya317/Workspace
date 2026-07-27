import type {
  DataSurfaceColumnSpec,
  DataSurfaceDisplaySpec,
} from "@workspace/core/ui";
import type {
  ConsolidationEntityCoverage,
  ConsolidationInvestmentEvidence,
  ConsolidationReadinessCheck,
  StatementSourceCoverage,
} from "@workspace/finance/types";

import type { ExchangeRateSummaryRow } from "./consolidation-fx-summary";

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

export function createConsolidationEntityColumns(input: {
  canUpdate: boolean;
  busyRelationId: number | null;
  onInclusionChange: (row: ConsolidationEntityCoverage, included: boolean) => void;
}): DataSurfaceColumnSpec<ConsolidationEntityCoverage>[] {
  return [
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
  {
    key: "consolidated",
    label: "本次并表",
    required: true,
    width: "sm",
    cell: (row) => {
      const disabled = !input.canUpdate
          || row.role === "母公司"
          || row.entitySnapshotId != null
          || row.relationId === null
          || row.relationVersion === null
          || input.busyRelationId === row.relationId;
      return {
        kind: "action",
        action: {
          key: `consolidation-${row.relationId ?? row.companyId ?? row.code}`,
          label: row.isConsolidated ? "本次纳入" : "本次不纳入",
          title: disabled
            ? row.isConsolidated ? "本次纳入" : "本次不纳入"
            : row.isConsolidated ? "本次纳入，点击移出" : "本次不纳入，点击纳入",
          icon: row.isConsolidated ? "check" : "x",
          presentation: "glyph",
          tone: row.isConsolidated ? "green" : "slate",
          disabled,
          onClick: () => input.onInclusionChange(row, !row.isConsolidated),
        },
      };
    },
  },
  { key: "balance", label: "资产负债表", required: true, width: "xl", cell: (row) => sourceCell(row.balanceSheet) },
  { key: "income", label: "利润表", required: true, width: "xl", cell: (row) => sourceCell(row.incomeStatement) },
  { key: "cash-flow", label: "现金流量表", required: true, width: "xl", cell: (row) => sourceCell(row.cashFlow) },
  ];
}

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
