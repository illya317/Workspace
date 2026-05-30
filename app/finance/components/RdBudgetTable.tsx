"use client";

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
    <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
      <table className="w-full text-xs">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">研发项目</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">产品类别</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">关联科目</th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">{m}</th>
            ))}
            <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">合计</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{item.project}</td>
              <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{item.category}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {item.accountCode ? (
                  <span className={`font-mono text-xs ${item.accountActive ? "text-emerald-600" : "text-gray-400"}`}>
                    {item.accountCode} {item.accountActive ? "" : "(未启用)"}
                  </span>
                ) : (
                  <span className="text-xs text-red-400">未关联</span>
                )}
              </td>
              {item.months.map((v, m) => (
                <td key={m} className={`px-2 py-2 text-right whitespace-nowrap ${v > 0 ? "text-gray-700" : "text-gray-300"}`}>
                  {v > 0 ? v.toFixed(2) : ""}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-medium text-gray-800 whitespace-nowrap">{item.total.toFixed(2)}</td>
            </tr>
          ))}
          {/* Total Row */}
          <tr className="border-t-2 border-gray-200 bg-gray-100 font-medium">
            <td className="px-3 py-2 text-gray-800" colSpan={3}>合计</td>
            {monthTotals.map((v, m) => (
              <td key={m} className="px-2 py-2 text-right text-gray-800">{v.toFixed(2)}</td>
            ))}
            <td className="px-3 py-2 text-right text-emerald-700">{total.toFixed(2)}</td>
          </tr>
          {items.length === 0 && (
            <tr>
              <td colSpan={16} className="px-3 py-8 text-center text-gray-400">
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
