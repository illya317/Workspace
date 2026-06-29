"use client";

import { createPageBody, PageSurface, createPageDataSection, type DataSurfaceColumnSpec, type DataSurfaceTableProps } from "@workspace/core/ui";
import { formatFinanceAmount } from "../formatters";

export interface ReportLine {
  label: string;
  code?: string;
  amount: number;
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

function renderAmount(value: number) {
  if (Math.abs(value) < 0.01) return <span className="text-gray-300">—</span>;
  const isNegative = value < 0;
  return (
    <span className={isNegative ? "text-red-600" : "text-gray-800"}>
      {isNegative ? "-" : ""}{formatFinanceAmount(Math.abs(value))}
    </span>
  );
}

interface Props {
  items: ReportLine[];
  labelHeader: string;
  amountHeader: string;
  expandedCodes: Set<string>;
  details: Record<string, AccountDetail[]>;
  loadingDetail: string | null;
  onToggle: (code: string) => void;
}

function createDetailColumns(): DataSurfaceColumnSpec<AccountDetail>[] {
  return [
    { key: "code", label: "科目编码", required: true, font: "mono", cell: (row) => row.code },
    { key: "name", label: "科目名称", required: true, cell: (row) => row.name },
    { key: "openingDebit", label: "期初借", required: true, align: "right", cell: (row) => row.openingDebit > 0 ? formatFinanceAmount(row.openingDebit) : "" },
    { key: "openingCredit", label: "期初贷", required: true, align: "right", cell: (row) => row.openingCredit > 0 ? formatFinanceAmount(row.openingCredit) : "" },
    { key: "currentDebit", label: "本期借", required: true, align: "right", cell: (row) => row.currentDebit > 0 ? formatFinanceAmount(row.currentDebit) : "" },
    { key: "currentCredit", label: "本期贷", required: true, align: "right", cell: (row) => row.currentCredit > 0 ? formatFinanceAmount(row.currentCredit) : "" },
    {
      key: "closing",
      label: "期末余额",
      required: true,
      align: "right", emphasis: "medium",
      cell: (row) => (
        <span className={row.closing < 0 ? "text-red-600" : "text-gray-800"}>
          {formatFinanceAmount(Math.abs(row.closing))}{row.balanceDirection === "credit" && row.closing !== 0 ? " (贷)" : ""}
        </span>
      ),
    },
  ];
}

function DetailRows({ rows }: { rows: AccountDetail[] }) {
  const total = rows.reduce((sum, detail) => sum + detail.closing, 0);
  const detailColumns = createDetailColumns();

  return (
    <div className="space-y-2">
      <PageSurface kind="standard"
        embedded
        body={createPageBody([
          createPageDataSection("report-line-details", {
            kind: "table",
            rows,
            columns: detailColumns,
            visibleColumns: detailColumns.map((column) => column.key),
                        presentation: { density: "compact" },

            rowKey: (row) => row.code,
          }),
        ])}
      />
      <p className="text-right text-xs font-medium text-gray-800">合计：{formatFinanceAmount(Math.abs(total))}</p>
    </div>
  );
}

export function createReportLinesSurface({ items, labelHeader, amountHeader, expandedCodes, details, loadingDetail, onToggle }: Props): DataSurfaceTableProps<ReportLine> {
  const columns: DataSurfaceColumnSpec<ReportLine>[] = [
    {
      key: "label",
      label: labelHeader,
      required: true,
      cell: (item) => {
        const hasCode = !!item.code;
        const isExpanded = hasCode && expandedCodes.has(item.code!);
        return (
          <span className={`flex items-center gap-1 ${item.isHeader || item.isTotal || item.isGrandTotal ? "" : "pl-4"}`}>
            {hasCode && <span className="text-xs text-gray-300">{isExpanded ? "▼" : "▶"}</span>}
            {item.label}
          </span>
        );
      },
    },
    {
      key: "amount",
      label: amountHeader,
      required: true,
      align: "right",

      cell: (item) => renderAmount(item.amount),
    },
  ];

  return {
    kind: "table",
    rows: items,
    columns,
    visibleColumns: ["label", "amount"],
        presentation: { density: "compact" },

    rowKey: (_, index) => index,
    onRowClick: (item) => item.code && onToggle(item.code),
    rowState: (item) =>
      item.isGrandTotal ? "total" :
      item.isTotal ? "total" :
      item.isHeader ? "section" : "normal",
    expandedRowKeys: items.map((item, index) => item.code && expandedCodes.has(item.code) ? index : null).filter((key): key is number => key !== null),
    expandedRowContent: (item) => {
      if (!item.code) return [];
      const detailRows = details[item.code];
      return loadingDetail === item.code
        ? <p className="py-2 text-xs text-gray-400">加载明细...</p>
        : detailRows?.length ? <DetailRows rows={detailRows} /> : <p className="py-2 text-xs text-gray-400">无明细数据</p>;
    },
  };
}

export default function ReportLines(props: Props) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([createPageDataSection("report-lines", createReportLinesSurface(props))])}
    />
  );
}
