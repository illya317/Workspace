import type { DataSurfaceColumnSpec, DataSurfaceDisplaySpec } from "@workspace/core/ui";
import type {
  ConsolidationEntityCoverage,
  ConsolidationReadinessCheck,
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
        { kind: "text", value: `${row.code} · ${row.role}`, tone: "muted" },
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

export const consolidationCheckColumns: DataSurfaceColumnSpec<ConsolidationReadinessCheck>[] = [
  { key: "label", label: "合并控制点", required: true, width: "lg", emphasis: "medium", cell: (row) => row.label },
  { key: "status", label: "状态", required: true, width: "sm", cell: (row) => statusBadge(row.status) },
  { key: "detail", label: "当前事实 / 下一步", required: true, width: "wide", tone: "muted", cell: (row) => row.detail },
];
