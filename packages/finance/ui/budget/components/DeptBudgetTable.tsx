"use client";

import { createPageBody, PageSurface, createPageTableSection, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { DeptBudgetItem } from "../types";

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

interface DeptBudgetTableProps {
  items: DeptBudgetItem[];
  monthTotals: number[];
  total: number;
}

type DeptBudgetRow =
  | ({ kind: "item"; id: string } & DeptBudgetItem)
  | { kind: "total"; id: string; months: number[]; total: number };

export default function DeptBudgetTable({ items, monthTotals, total }: DeptBudgetTableProps) {
  const rows: DeptBudgetRow[] = [
    ...items.map((item, index) => ({ ...item, kind: "item" as const, id: `${item.dept}-${item.account}-${index}` })),
    { kind: "total", id: "total", months: monthTotals, total },
  ];
  const columns: DataSurfaceColumnSpec<DeptBudgetRow>[] = [
    { key: "dept", label: "部门", required: true, cell: (row) => row.kind === "total" ? "合计" : row.dept },
    { key: "account", label: "科目", required: true, cell: (row) => row.kind === "total" ? null : row.account },
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
    {
      key: "expenseType",
      label: "费用类型",
      required: true,
      cell: (row) => {
        if (row.kind === "total") return null;
        const className = row.expenseType === "管理费用"
          ? "bg-blue-100 text-blue-700"
          : row.expenseType === "销售费用"
          ? "bg-orange-100 text-orange-700"
          : row.expenseType === "研发费用"
          ? "bg-purple-100 text-purple-700"
          : "bg-gray-100 text-gray-600";
        return <span className={`rounded px-1.5 py-0.5 text-xs ${className}`}>{row.expenseType}</span>;
      },
    },
    ...MONTH_LABELS.map((label, monthIndex): DataSurfaceColumnSpec<DeptBudgetRow> => ({
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

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPageTableSection("dept-budget", {
          framed: true,


          rows,
          columns,
          visibleColumns: columns.map((column) => column.key),
          emptyText: "暂无数据",
          rowKey: (row) => row.id,
          rowState: (row) => row.kind === "total" ? "total" : "normal",
        }),
      ])}
    />
  );
}
