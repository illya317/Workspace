"use client";

import { useEffect, useState } from "react";
import FinanceFilters from "./components/FinanceFilters";

interface Period {
  id: number;
  year: number;
  month: number;
  companyCode?: string | null;
}

interface ReportLine {
  label: string;
  code?: string;
  amount: number;
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
}

interface ReportData {
  type: string;
  period: Period;
  assets?: ReportLine[];
  liabilities?: ReportLine[];
  equity?: ReportLine[];
  totalLiabilitiesAndEquity?: number;
  lines?: ReportLine[];
  cashAccounts?: { code: string; name: string; opening?: number; closing?: number }[];
  netChange?: number;
}

export default function ReportTab() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [companyFilter, setCompanyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [reportType, setReportType] = useState<"balance" | "income" | "cashflow">("balance");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/finance/periods").then((r) => r.json()).then((d) => {
      const list = d.periods || [];
      setPeriods(list);
      if (list.length && !companyFilter && !yearFilter && !monthFilter) {
        const first = list[0];
        if (first.companyCode) setCompanyFilter(first.companyCode);
        setYearFilter(String(first.year));
        setMonthFilter(String(first.month));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (companyFilter && yearFilter && monthFilter) {
      const p = periods.find((p) => p.companyCode === companyFilter && String(p.year) === yearFilter && String(p.month) === monthFilter);
      setSelectedPeriod(p?.id || null);
    }
  }, [companyFilter, yearFilter, monthFilter, periods]);

  async function loadReport() {
    if (!companyFilter || !yearFilter || !monthFilter) return;
    setLoading(true);
    const res = await fetch(`/api/finance/reports?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}&type=${reportType}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  function renderAmount(v: number, isNegative = false) {
    if (Math.abs(v) < 0.01) return <span className="text-gray-300">—</span>;
    return <span className={v < 0 || isNegative ? "text-red-600" : "text-gray-800"}>{v.toFixed(2)}</span>;
  }

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
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">报表</label>
              <select value={reportType} onChange={(e) => setReportType(e.target.value as "balance" | "income" | "cashflow")} className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none">
                <option value="balance">资产负债表</option>
                <option value="income">利润表</option>
                <option value="cashflow">现金流量表</option>
              </select>
            </div>
            <button onClick={loadReport} disabled={!selectedPeriod} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">生成报表</button>
          </>
        }
      />

      {loading && <p className="p-8 text-center text-gray-500">加载中...</p>}

      {data?.type === "balance" && (
        <div className="rounded-lg bg-white shadow-sm p-4">
          <h3 className="text-base font-semibold text-gray-800 text-center mb-1">资 产 负 债 表</h3>
          <p className="text-xs text-gray-500 text-center mb-4">{data.period.year}年{data.period.month}月</p>
          <div className="grid grid-cols-2 gap-0">
            {/* 左侧：资产 */}
            <div className="border-r border-gray-200 pr-4">
              <table className="w-full text-xs">
                <thead className="border-b"><tr>
                  <th className="py-1 text-left font-medium text-gray-700">资  产</th>
                  <th className="py-1 text-right font-medium text-gray-700">年末余额</th>
                </tr></thead>
                <tbody>
                  {data.assets?.map((item, i) => (
                    <tr key={i} className={`border-b ${item.isGrandTotal ? "border-t-2 border-gray-300 font-bold" : item.isTotal ? "font-medium bg-gray-50" : item.isHeader ? "font-medium text-gray-700" : ""}`}>
                      <td className={`py-1 ${item.isHeader ? "text-gray-700" : item.isTotal || item.isGrandTotal ? "text-gray-800" : "text-gray-600 pl-4"}`}>{item.label}</td>
                      <td className="py-1 text-right">{renderAmount(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 右侧：负债+权益 */}
            <div className="pl-4">
              <table className="w-full text-xs">
                <thead className="border-b"><tr>
                  <th className="py-1 text-left font-medium text-gray-700">负债及所有者权益</th>
                  <th className="py-1 text-right font-medium text-gray-700">年末余额</th>
                </tr></thead>
                <tbody>
                  {data.liabilities?.map((item, i) => (
                    <tr key={`l${i}`} className={`border-b ${item.isTotal ? "font-medium bg-gray-50" : item.isHeader ? "font-medium text-gray-700" : ""}`}>
                      <td className={`py-1 ${item.isHeader ? "text-gray-700" : item.isTotal ? "text-gray-800" : "text-gray-600 pl-4"}`}>{item.label}</td>
                      <td className="py-1 text-right">{renderAmount(item.amount)}</td>
                    </tr>
                  ))}
                  {data.equity?.map((item, i) => (
                    <tr key={`e${i}`} className={`border-b ${item.isGrandTotal ? "border-t-2 border-gray-300 font-bold" : item.isTotal ? "font-medium bg-gray-50" : item.isHeader ? "font-medium text-gray-700" : ""}`}>
                      <td className={`py-1 ${item.isHeader ? "text-gray-700" : item.isTotal || item.isGrandTotal ? "text-gray-800" : "text-gray-600 pl-4"}`}>{item.label}</td>
                      <td className="py-1 text-right">{renderAmount(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {data.totalLiabilitiesAndEquity !== undefined && (
            <p className="text-xs text-gray-400 text-center mt-2">
              资产总计 = {data.assets?.find((a) => a.isGrandTotal)?.amount.toFixed(2)} | 负债和权益总计 = {data.totalLiabilitiesAndEquity.toFixed(2)}
              {Math.abs((data.assets?.find((a) => a.isGrandTotal)?.amount || 0) - data.totalLiabilitiesAndEquity) > 0.01 && (
                <span className="text-red-500 ml-2">⚠ 不平衡</span>
              )}
            </p>
          )}
        </div>
      )}

      {data?.type === "income" && (
        <div className="rounded-lg bg-white shadow-sm p-4">
          <h3 className="text-base font-semibold text-gray-800 text-center mb-1">利  润  表</h3>
          <p className="text-xs text-gray-500 text-center mb-4">{data.period.year}年{data.period.month}月</p>
          <table className="w-full text-xs max-w-2xl mx-auto">
            <thead className="border-b"><tr>
              <th className="py-1 text-left font-medium text-gray-700">项       目</th>
              <th className="py-1 text-right font-medium text-gray-700">本年金额</th>
            </tr></thead>
            <tbody>
              {data.lines?.map((line, i) => (
                <tr key={i} className={`border-b ${line.isGrandTotal ? "border-t-2 border-gray-300 font-bold" : line.isTotal ? "font-medium bg-gray-50" : ""}`}>
                  <td className={`py-1.5 ${line.isTotal || line.isGrandTotal ? "text-gray-800" : "text-gray-600"}`}>{line.label}</td>
                  <td className="py-1.5 text-right">{renderAmount(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.type === "cashflow" && (
        <div className="rounded-lg bg-white shadow-sm p-4">
          <h3 className="text-base font-semibold text-gray-800 text-center mb-1">现金流量表（简化）</h3>
          <p className="text-xs text-gray-500 text-center mb-4">{data.period.year}年{data.period.month}月</p>
          <table className="w-full text-xs max-w-2xl mx-auto">
            <thead className="border-b bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">科目</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">期初余额</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">期末余额</th>
            </tr></thead>
            <tbody>
              {data.cashAccounts?.map((a) => (
                <tr key={a.code} className="border-b">
                  <td className="px-3 py-2 text-gray-600">{a.code} {a.name}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{a.opening?.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{a.closing?.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="font-semibold border-t-2 border-gray-300">
                <td className="px-3 py-2 text-gray-800">现金及等价物净增加额</td>
                <td className="px-3 py-2 text-right" />
                <td className="px-3 py-2 text-right text-emerald-700">{data.netChange?.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
