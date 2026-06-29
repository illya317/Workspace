"use client";

import { createPageBody, PageSurface, createPageTableSection, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { RdBudgetItem } from "../types";

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

interface RdBudgetTableProps {
  items: RdBudgetItem[];
  monthTotals: number[];
  total: number;
}

type RdBudgetRow =
  | ({ kind: "item"; id: string } & RdBudgetItem)
  | { kind: "total"; id: string; months: number[]; total: number };

export default function RdBudgetTable({ items, monthTotals, total }: RdBudgetTableProps) {
  return (
    <PageSurface kind="standard" embedded body={createPageBody([createRdBudgetTableSection({ items, monthTotals, total })])} />
  );
}

export function createRdBudgetTableSection({ items, monthTotals, total }: RdBudgetTableProps): BodySurfaceSectionSpec {
  const rows: RdBudgetRow[] = [
    ...items.map((item, index) => ({ ...item, kind: "item" as const, id: `${item.project}-${item.category}-${index}` })),
    { kind: "total", id: "total", months: monthTotals, total },
  ];
  const columns: DataSurfaceColumnSpec<RdBudgetRow>[] = [
    { key: "project", label: "研发项目", required: true, cell: (row) => row.kind === "total" ? "合计" : row.project },
    { key: "category", label: "产品类别", required: true, cell: (row) => row.kind === "total" ? null : row.category },
    {
      key: "accountCode",
      label: "关联科目",
      required: true,
      cell: (row) => {
        if (row.kind === "total") return null;
        if (!row.accountCode) return <span className="text-xs text-red-400">未关联</span>;
        return (
          <span className={`font-mono text-xs ${row.accountActive ? "text-emerald-600" : "text-gray-400"}`}>
            {row.accountCode} {row.accountActive ? "" : "(未启用)"}
          </span>
        );
      },
    },
    ...MONTH_LABELS.map((label, monthIndex): DataSurfaceColumnSpec<RdBudgetRow> => ({
      key: `m${monthIndex}`,
      label,
      required: true,
      align: "right",

      cell: (row) => {
        const value = row.months[monthIndex] ?? 0;
        if (row.kind === "total") return value.toFixed(2);
        return value > 0 ? value.toFixed(2) : "";
      },
    })),
    {
      key: "total",
      label: "合计",
      required: true,
      align: "right",
       emphasis: "medium",
      cell: (row) => row.total.toFixed(2),
    },
  ];

  return createPageTableSection("rd-budget", {


    rows,
    columns,
    visibleColumns: columns.map((column) => column.key),
    emptyText: "暂无数据",
    rowKey: (row) => row.id,
    rowState: (row) => row.kind === "total" ? "total" : "normal",
  });
}
