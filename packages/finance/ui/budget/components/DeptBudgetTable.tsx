"use client";

import { DataTable, PanelCard, type DataTableColumn } from "@workspace/core/ui";
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
  const columns: DataTableColumn<DeptBudgetRow>[] = [
    { key: "dept", label: "部门", required: true, render: (row) => row.kind === "total" ? "合计" : row.dept },
    { key: "account", label: "科目", required: true, render: (row) => row.kind === "total" ? null : row.account },
    {
      key: "accountCode",
      label: "关联科目",
      required: true,
      render: (row) => {
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
      render: (row) => {
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
    ...MONTH_LABELS.map((label, monthIndex): DataTableColumn<DeptBudgetRow> => ({
      key: `m${monthIndex}`,
      label,
      required: true,
      headerClassName: "text-right",
      className: "text-right",
      render: (row) => {
        const value = row.months[monthIndex] ?? 0;
        if (row.kind === "total") return value.toFixed(2);
        return value > 0 ? value.toFixed(2) : "";
      },
    })),
    {
      key: "total",
      label: "合计",
      required: true,
      headerClassName: "text-right",
      className: "text-right font-medium",
      render: (row) => row.total.toFixed(2),
    },
  ];

  return (
    <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
      <DataTable
        rows={rows}
        columns={columns}
        visibleColumns={columns.map((column) => column.key)}
        emptyText="暂无数据"
        rowKey={(row) => row.id}
        rowClassName={(row) => row.kind === "total" ? "bg-slate-50 font-medium" : ""}
      />
    </PanelCard>
  );
}
