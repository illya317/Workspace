"use client";

import { PanelCard } from "@workspace/core/ui";
import { RdBudgetItem } from "../BudgetTab";

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

interface RdBudgetTableProps {
  items: RdBudgetItem[];
  monthTotals: number[];
  total: number;
}

export default function RdBudgetTable({ items, monthTotals, total }: RdBudgetTableProps) {
  return (
    <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 font-medium">研发项目</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">产品类别</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">关联科目</th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="whitespace-nowrap px-3 py-3 text-right font-medium">{m}</th>
            ))}
            <th className="whitespace-nowrap px-4 py-3 text-right font-medium">合计</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {items.map((item, idx) => (
            <tr key={idx} className="hover:bg-emerald-50/20">
              <td className="whitespace-nowrap px-4 py-3 text-slate-800">{item.project}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-800">{item.category}</td>
              <td className="whitespace-nowrap px-4 py-3">
                {item.accountCode ? (
                  <span className={`font-mono text-xs ${item.accountActive ? "text-emerald-600" : "text-gray-400"}`}>
                    {item.accountCode} {item.accountActive ? "" : "(未启用)"}
                  </span>
                ) : (
                  <span className="text-xs text-red-400">未关联</span>
                )}
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
            <td className="px-4 py-3 text-slate-800" colSpan={3}>合计</td>
            {monthTotals.map((v, m) => (
              <td key={m} className="px-3 py-3 text-right text-slate-800">{v.toFixed(2)}</td>
            ))}
            <td className="px-4 py-3 text-right text-emerald-700">{total.toFixed(2)}</td>
          </tr>
          {items.length === 0 && (
            <tr>
              <td colSpan={16} className="px-4 py-8 text-center text-gray-400">
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </PanelCard>
  );
}
