import type { DataSurfaceColumnSpec, DataSurfaceDisplaySpec } from "@workspace/core/ui";
import type { ConsolidatedOutputLine, StatementReportType } from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";
export const CONSOLIDATED_REPORT_TYPE_OPTIONS = [
  { value: "balanceSheet", label: "合并资产负债表" },
  { value: "incomeStatement", label: "合并利润表" },
  { value: "cashFlow", label: "合并现金流量表" },
] satisfies { value: StatementReportType; label: string }[];
function amountDisplay(value: number): DataSurfaceDisplaySpec {
  if (Math.abs(value) < 0.005) return { kind: "empty" };
  return { kind: "text", value: `${value < 0 ? "-" : ""}${formatFinanceAmount(Math.abs(value))}`, tone: value < 0 ? "danger" : "default" };
}
export const consolidatedReportColumns: DataSurfaceColumnSpec<ConsolidatedOutputLine>[] = [
  {
    key: "line",
    label: "项目",
    required: true,
    width: "wide",
    cell: (row) => ({
      kind: "stack",
      gap: "xs",
      items: [
        { kind: "text", value: row.label, emphasis: row.isHeader || row.isTotal || row.isGrandTotal ? "strong" : "normal", wrap: "wrap" },
        ...(!row.isHeader && !row.isTotal && !row.isGrandTotal
          ? [{ kind: "text" as const, value: row.lineCode, tone: "muted" as const }]
          : []),
      ],
    }),
  },
  { key: "source", label: "单体汇总", required: true, align: "right", width: "md", cell: (row) => amountDisplay(row.sourceAmount) },
  { key: "adjustment", label: "抵销调整", required: true, align: "right", width: "md", cell: (row) => amountDisplay(row.adjustmentAmount) },
  { key: "consolidated", label: "合并数", required: true, align: "right", width: "md", emphasis: "medium", cell: (row) => amountDisplay(row.amount) },
  { key: "previousSource", label: "上期单体", align: "right", width: "md", cell: (row) => amountDisplay(row.previousSourceAmount ?? row.previousAmount) },
  { key: "previousAdjustment", label: "上期抵销", align: "right", width: "md", cell: (row) => amountDisplay(row.previousAdjustmentAmount ?? 0) },
  { key: "previous", label: "上期合并", required: true, align: "right", width: "md", cell: (row) => amountDisplay(row.previousAmount) },
];
