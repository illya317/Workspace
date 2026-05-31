"use client";

import { useEffect, useState } from "react";
import FinanceFilters from "../components/FinanceFilters";

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

export default function SchedulesClient() {
  const [companyFilter, setCompanyFilter] = useState("02");
  const [yearFilter, setYearFilter] = useState("2025");
  const [monthFilter, setMonthFilter] = useState("12");
  const [entries, setEntries] = useState<ReclassEntry[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!companyFilter || !yearFilter || !monthFilter) return;
    setLoading(true);
    const res = await fetch(
      `/api/finance/schedules/reclassify?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}`
    );
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyFilter, yearFilter, monthFilter]);

  function exportCSV() {
    const header = "科目编码,科目名称,方向,借方余额,贷方余额,净额,说明\n";
    const rows = entries.map(e =>
      `"${e.accountCode}","${e.accountName}","${sideLabel(e.fromSide)}",${e.closingDebit},${e.closingCredit},${Math.abs(e.netAmount)},"${e.reason}"`
    ).join("\n");
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `重分类_${companyFilter}_${yearFilter}${monthFilter}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const sideLabel = (s: string) => s === "asset" ? "资产→负债" : "负债→资产";

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
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-30"
              title="导出CSV"
            >
              <svg className="h-4 w-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <span className="text-xs text-gray-400">{entries.length} 项</span>
          </>
        }
      />

      {loading ? (
        <p className="p-8 text-center text-gray-500">加载中...</p>
      ) : entries.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <p className="text-gray-400">未发现需重分类的科目</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">科目编码</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">科目名称</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">方向</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">借方余额</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">贷方余额</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">净额</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">说明</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.accountCode} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-700">{e.accountCode}</td>
                  <td className="px-3 py-2 text-gray-700">{e.accountName}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                      e.fromSide === "asset" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
                    }`}>
                      {sideLabel(e.fromSide)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{fmt(e.closingDebit)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{fmt(e.closingCredit)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-800">
                    {fmt(Math.abs(e.netAmount))}
                  </td>
                  <td className="px-3 py-2 text-gray-500 max-w-xs truncate" title={e.reason}>
                    {e.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
