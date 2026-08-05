"use client";

import { createPageBody, BodySurface, createPageDataSection, type DataSurfaceCellSpec, type DataSurfaceColumnSpec, type DataSurfaceDisplaySpec, type DataSurfaceTableProps } from "@workspace/core/ui";
import {
  BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL,
  BALANCE_SHEET_CURRENT_AMOUNT_LABEL,
  FLOW_STATEMENT_COMPARATIVE_AMOUNT_LABEL,
  FLOW_STATEMENT_CURRENT_AMOUNT_LABEL,
  FLOW_STATEMENT_CURRENT_MONTH_AMOUNT_LABEL,
} from "@workspace/finance/types/statement-period";
import { formatFinanceAmount } from "../formatters";

export interface ReportLine {
  label: string;
  code?: string;
  amount: number;
  currentMonthAmount?: number;
  previousAmount?: number;
  side?: "debit" | "credit";
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
}

export interface AccountDetail {
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closing: number;
  currentMonthAmount?: number;
  amount?: number;
  previousAmount?: number;
}

type ReportDetailMode = "balance" | "income" | "none";

function amountDisplay(value: number): DataSurfaceDisplaySpec {
  if (Math.abs(value) < 0.01) return { kind: "empty" };
  const isNegative = value < 0;
  return { kind: "text", value: `${isNegative ? "-" : ""}${formatFinanceAmount(Math.abs(value))}`, tone: isNegative ? "danger" : "default" };
}

function hoverHeader(label: string) {
  return <span title={label}>{label}</span>;
}

function detailBalanceDisplay(value: number): DataSurfaceDisplaySpec {
  if (Math.abs(value) < 0.01) return { kind: "empty" };
  return {
    kind: "text",
    value: `${formatFinanceAmount(Math.abs(value))}${value < 0 ? " (贷)" : " (借)"}`,
    tone: value < 0 ? "danger" : "default",
  };
}

interface Props {
  items: ReportLine[];
  labelHeader: string;
  amountHeader: string;
  previousAmountHeader: string;
  currentMonthAmountHeader?: string;
  expandedCodes: Set<string>;
  details: Record<string, AccountDetail[]>;
  loadingDetail: string | null;
  detailMode: ReportDetailMode;
  detailKeyPrefix?: string;
  onToggle: (key: string, code: string, direction: "debit" | "credit") => void;
}

function detailKey(item: ReportLine, prefix = "report") {
  return `${prefix}:${item.label}:${item.code}`;
}

function createDetailColumns(detailMode: Exclude<ReportDetailMode, "none">): DataSurfaceColumnSpec<AccountDetail>[] {
  if (detailMode === "income") return [
    {
      key: "account",
      label: hoverHeader("科目"),
      required: true,
      cell: (row) => `${row.name} · ${row.code}`,
    },
    {
      key: "currentMonthAmount",
      label: hoverHeader(FLOW_STATEMENT_CURRENT_MONTH_AMOUNT_LABEL),
      required: true,
      align: "right",
      cell: (row) => amountDisplay(row.currentMonthAmount ?? 0),
    },
    {
      key: "amount",
      label: hoverHeader(FLOW_STATEMENT_CURRENT_AMOUNT_LABEL),
      required: true,
      align: "right",
      cell: (row) => amountDisplay(row.amount ?? 0),
    },
    {
      key: "previousAmount",
      label: hoverHeader(FLOW_STATEMENT_COMPARATIVE_AMOUNT_LABEL),
      required: true,
      align: "right",
      cell: (row) => amountDisplay(row.previousAmount ?? 0),
    },
  ];
  return [
    {
      key: "account",
      label: hoverHeader("科目"),
      required: true,
      cell: (row) => row.category === "reclass" ? row.name : `${row.name} · ${row.code}`,
    },
    {
      key: "closing",
      label: hoverHeader(BALANCE_SHEET_CURRENT_AMOUNT_LABEL),
      required: true,
      align: "right",
      cell: (row) => detailBalanceDisplay(row.closing),
    },
    {
      key: "opening",
      label: hoverHeader(BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL),
      required: true,
      align: "right",
      cell: (row) => detailBalanceDisplay(row.openingDebit - row.openingCredit),
    },
  ];
}

/** @ui-structural-declaration Expanded account-detail table and aggregate. */
function createDetailRowsSpec(rows: AccountDetail[], detailMode: Exclude<ReportDetailMode, "none">): DataSurfaceCellSpec {
  if (detailMode === "income") {
    const currentMonthTotal = rows.reduce((sum, detail) => sum + (detail.currentMonthAmount ?? 0), 0);
    const currentTotal = rows.reduce((sum, detail) => sum + (detail.amount ?? 0), 0);
    const previousTotal = rows.reduce((sum, detail) => sum + (detail.previousAmount ?? 0), 0);
    const detailColumns = createDetailColumns(detailMode);
    return { kind: "group", direction: "column", items: [
      { kind: "data", data: { kind: "table", rows, columns: detailColumns, visibleColumns: detailColumns.map((column) => column.key), presentation: { density: "compact" }, rowKey: (row) => row.code } },
      { kind: "text", value: `当月合计：${formatFinanceAmount(currentMonthTotal)}　本年累计合计：${formatFinanceAmount(currentTotal)}　上年同期累计合计：${formatFinanceAmount(previousTotal)}`, emphasis: "strong" },
    ] };
  }
  const openingTotal = rows.reduce((sum, detail) => sum + detail.openingDebit - detail.openingCredit, 0);
  const closingTotal = rows.reduce((sum, detail) => sum + detail.closing, 0);
  const detailColumns = createDetailColumns(detailMode);
  return { kind: "group", direction: "column", items: [
    { kind: "data", data: { kind: "table", rows, columns: detailColumns, visibleColumns: detailColumns.map((column) => column.key), presentation: { density: "compact" }, rowKey: (row) => row.code } },
    { kind: "text", value: `期末合计：${formatFinanceAmount(Math.abs(closingTotal))}　上年年末合计：${formatFinanceAmount(Math.abs(openingTotal))}`, emphasis: "strong" },
  ] };
}

export function createReportLinesSurface({ items, labelHeader, amountHeader, previousAmountHeader, currentMonthAmountHeader, expandedCodes, details, loadingDetail, detailMode, detailKeyPrefix, onToggle }: Props): DataSurfaceTableProps<ReportLine> {
  const columns: DataSurfaceColumnSpec<ReportLine>[] = [
    {
      key: "label",
      label: hoverHeader(labelHeader),
      required: true,
      cell: (item) => {
        const hasCode = detailMode !== "none" && !!item.code;
        const isExpanded = hasCode && expandedCodes.has(detailKey(item, detailKeyPrefix));
        if (!hasCode) return { kind: "text", value: item.label, emphasis: item.isHeader || item.isTotal || item.isGrandTotal ? "strong" : "normal" };
        return { kind: "disclosure", label: item.label, expanded: isExpanded, level: item.isHeader || item.isTotal || item.isGrandTotal ? 0 : 1 };
      },
    },
    ...(currentMonthAmountHeader ? [{
      key: "currentMonthAmount",
      label: hoverHeader(currentMonthAmountHeader),
      required: true,
      align: "right" as const,
      cell: (item: ReportLine) => amountDisplay(item.currentMonthAmount ?? 0),
    }] : []),
    {
      key: "amount",
      label: hoverHeader(amountHeader),
      required: true,
      align: "right",

      cell: (item) => amountDisplay(item.amount),
    },
    {
      key: "previousAmount",
      label: hoverHeader(previousAmountHeader),
      required: true,
      align: "right" as const,
      cell: (item: ReportLine) => amountDisplay(item.previousAmount ?? 0),
    },
  ];

  return {
    kind: "table",
    rows: items,
    columns,
    visibleColumns: [
      "label",
      ...(currentMonthAmountHeader ? ["currentMonthAmount"] : []),
      "amount",
      "previousAmount",
    ],
    presentation: { density: "compact" },

    rowKey: (_, index) => index,
    rowState: (item) =>
      item.isGrandTotal ? "total" :
      item.isTotal ? "total" :
      item.isHeader ? "section" : "normal",
    ...(detailMode === "none" ? {} : {
      onRowClick: (item: ReportLine) => item.code && onToggle(detailKey(item, detailKeyPrefix), item.code, item.side ?? "debit"),
      expandedRowKeys: items.map((item, index) => item.code && expandedCodes.has(detailKey(item, detailKeyPrefix)) ? index : null).filter((key): key is number => key !== null),
      expandedRow: (item: ReportLine) => {
        if (!item.code) return null;
        const key = detailKey(item, detailKeyPrefix);
        const rows = details[key];
        return loadingDetail === key
          ? { kind: "text", value: "加载明细...", tone: "muted" }
          : rows?.length ? createDetailRowsSpec(rows, detailMode) : { kind: "empty", content: "无明细数据" };
      },
    }),
  };
}

export default function ReportLines(props: Props) {
  return (
    <BodySurface {...createPageBody([createPageDataSection("report-lines", createReportLinesSurface(props))])} />
  );
}
