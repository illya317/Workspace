"use client";

import { createPageBody, BodySurface, createPageDataSection, type DataSurfaceCellSpec, type DataSurfaceColumnSpec, type DataSurfaceDisplaySpec, type DataSurfaceTableProps } from "@workspace/core/ui";
import {
  BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL,
  BALANCE_SHEET_CURRENT_AMOUNT_LABEL,
} from "@workspace/finance/types/statement-period";
import { formatFinanceAmount } from "../formatters";

export interface ReportLine {
  label: string;
  code?: string;
  amount: number;
  currentMonthAmount?: number;
  previousAmount?: number;
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
}

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
  detailKeyPrefix?: string;
  onToggle: (key: string, code: string) => void;
}

function detailKey(item: ReportLine, prefix = "report") {
  return `${prefix}:${item.label}:${item.code}`;
}

function createDetailColumns(): DataSurfaceColumnSpec<AccountDetail>[] {
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
function createDetailRowsSpec(rows: AccountDetail[]): DataSurfaceCellSpec {
  const openingTotal = rows.reduce((sum, detail) => sum + detail.openingDebit - detail.openingCredit, 0);
  const closingTotal = rows.reduce((sum, detail) => sum + detail.closing, 0);
  const detailColumns = createDetailColumns();
  return { kind: "group", direction: "column", items: [
    { kind: "data", data: { kind: "table", rows, columns: detailColumns, visibleColumns: detailColumns.map((column) => column.key), presentation: { density: "compact" }, rowKey: (row) => row.code } },
    { kind: "text", value: `期末合计：${formatFinanceAmount(Math.abs(closingTotal))}　上年年末合计：${formatFinanceAmount(Math.abs(openingTotal))}`, emphasis: "strong" },
  ] };
}

export function createReportLinesSurface({ items, labelHeader, amountHeader, previousAmountHeader, currentMonthAmountHeader, expandedCodes, details, loadingDetail, detailKeyPrefix, onToggle }: Props): DataSurfaceTableProps<ReportLine> {
  const columns: DataSurfaceColumnSpec<ReportLine>[] = [
    {
      key: "label",
      label: hoverHeader(labelHeader),
      required: true,
      cell: (item) => {
        const hasCode = !!item.code;
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
    onRowClick: (item) => item.code && onToggle(detailKey(item, detailKeyPrefix), item.code),
    rowState: (item) =>
      item.isGrandTotal ? "total" :
      item.isTotal ? "total" :
      item.isHeader ? "section" : "normal",
    expandedRowKeys: items.map((item, index) => item.code && expandedCodes.has(detailKey(item, detailKeyPrefix)) ? index : null).filter((key): key is number => key !== null),
    expandedRow: (item) => {
      if (!item.code) return null;
      const key = detailKey(item, detailKeyPrefix);
      const rows = details[key];
      return loadingDetail === key
        ? { kind: "text", value: "加载明细...", tone: "muted" }
        : rows?.length ? createDetailRowsSpec(rows) : { kind: "empty", content: "无明细数据" };
    },
  };
}

export default function ReportLines(props: Props) {
  return (
    <BodySurface {...createPageBody([createPageDataSection("report-lines", createReportLinesSurface(props))])} />
  );
}
