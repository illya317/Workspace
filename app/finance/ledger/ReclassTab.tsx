"use client";

import { useEffect, useState } from "react";
import { EmptyStateCard, PanelCard } from "@workspace/core/ui";
import FinanceFilters from "../components/FinanceFilters";
import { useCSV } from "@workspace/core/hooks";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ReclassEntry {
  accountCode: string;
  accountName: string;
  fromSide: string;
  toSide: string;
  closingDebit: number;
  closingCredit: number;
  netAmount: number;
  reason: string;
}

export default function ReclassTab() {
  const [companyFilter, setCompanyFilter] = useState("02");
  const [yearFilter, setYearFilter] = useState("2025");
  const [monthFilter, setMonthFilter] = useState("12");
  const [entries, setEntries] = useState<ReclassEntry[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!companyFilter || !yearFilter || !monthFilter) return;
    setLoading(true);
    const res = await fetch(`/workspace/api/finance/schedules/reclassify?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}`);
    if (res.ok) setEntries((await res.json()).entries || []);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [companyFilter, yearFilter, monthFilter]);

  const sideLabel = (s: string) => s === "asset" ? "资产→负债" : "负债→资产";
  const exportCSV = useCSV(
    `重分类_${companyFilter}_${yearFilter}${monthFilter}.csv`,
    "科目编码,科目名称,方向,借方余额,贷方余额,净额,说明\n",
    () => entries.map(e =>
      `"${e.accountCode}","${e.accountName}","${sideLabel(e.fromSide)}",${e.closingDebit},${e.closingCredit},${Math.abs(e.netAmount)},"${e.reason}"`
    ).join("\n")
  );

  return (
    <div className="space-y-4">
      <FinanceFilters
        companyFilter={companyFilter}
        yearFilter={yearFilter}
        monthFilter={monthFilter}
        onCompanyChange={setCompanyFilter}
        onYearChange={setYearFilter}
        onMonthChange={setMonthFilter}
        showPageSize={false}
        extra={
          <>
            <button onClick={exportCSV} disabled={entries.length === 0}
              className="rounded border border-gray-300 px-2 py-1 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
              title="导出CSV"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <span className="text-xs text-gray-400">{entries.length} 项</span>
          </>
        }
      />

      {loading ? <p className="p-8 text-center text-gray-500">加载中...</p> :
       entries.length === 0 ? (
        <EmptyStateCard>未发现需重分类的科目</EmptyStateCard>
      ) : (
        <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-medium">科目编码</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">科目名称</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">方向</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">借方余额</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">贷方余额</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">净额</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {entries.map((e) => (
                <tr key={e.accountCode} className="hover:bg-emerald-50/20">
                  <td className="px-4 py-3 font-mono text-slate-700">{e.accountCode}</td>
                  <td className="px-4 py-3 text-slate-800">{e.accountName}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      e.fromSide === "asset" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
                    }`}>{sideLabel(e.fromSide)}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmt(e.closingDebit)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmt(e.closingCredit)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(Math.abs(e.netAmount))}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-500" title={e.reason}>{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PanelCard>
      )}
    </div>
  );
}
