"use client";

import { PanelCard } from "@workspace/core/ui";
import { DeptBudgetItem } from "../BudgetTab";

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

interface DeptBudgetTableProps {
  items: DeptBudgetItem[];
  monthTotals: number[];
  total: number;
}

export default function DeptBudgetTable({ items, monthTotals, total }: DeptBudgetTableProps) {
  return (
    <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 font-medium">部门</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">科目</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">关联科目</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">费用类型</th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="whitespace-nowrap px-3 py-3 text-right font-medium">{m}</th>
            ))}
            <th className="whitespace-nowrap px-4 py-3 text-right font-medium">合计</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {items.map((item, idx) => (
            <tr key={idx} className="hover:bg-emerald-50/20">
              <td className="whitespace-nowrap px-4 py-3 text-slate-800">{item.dept}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-800">{item.account}</td>
              <td className="whitespace-nowrap px-4 py-3">
                {item.accountCode ? (
                  <span className={`font-mono text-xs ${item.accountActive ? "text-emerald-600" : "text-gray-400"}`}>
                    {item.accountCode} {item.accountActive ? "" : "(未启用)"}
                  </span>
                ) : (
                  <span className="text-xs text-red-400">未关联</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                <span className={`rounded px-1.5 py-0.5 text-xs ${
                  item.expenseType === "管理费用"
                    ? "bg-blue-100 text-blue-700"
                    : item.expenseType === "销售费用"
                    ? "bg-orange-100 text-orange-700"
                    : item.expenseType === "研发费用"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-100 text-gray-600"
                }`}>
                  {item.expenseType}
                </span>
              </td>
              {item.months.map((v, m) => (
                <td key={m} className={`whitespace-nowrap px-3 py-3 text-right ${v > 0 ? "text-slate-700" : "text-slate-300"}`}>
                  {v > 0 ? v.toFixed(2) : ""}
                </td>
              ))}
              <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-800">{item.total.toFixed(2)}</td>
            </tr>
          ))}
          {/* Total Row */}
          <tr className="border-t border-slate-200 bg-slate-50 font-medium">
            <td className="px-4 py-3 text-slate-800" colSpan={4}>合计</td>
            {monthTotals.map((v, m) => (
              <td key={m} className="px-3 py-3 text-right text-slate-800">{v.toFixed(2)}</td>
            ))}
            <td className="px-4 py-3 text-right text-emerald-700">{total.toFixed(2)}</td>
          </tr>
          {items.length === 0 && (
            <tr>
              <td colSpan={17} className="px-4 py-8 text-center text-gray-400">
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </PanelCard>
  );
}
