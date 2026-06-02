"use client";

import { useEffect, useState, useCallback } from "react";
import FinanceFilters from "../components/FinanceFilters";
import ReportLines from "./ReportLines";
import type { ReportLine, AccountDetail } from "./ReportLines";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Period { id: number; year: number; month: number; companyCode?: string | null; }

interface ReportData {
  type: string;
  period: Period;
  assets?: ReportLine[];
  liabilities?: ReportLine[];
  equity?: ReportLine[];
  totalLiabilitiesAndEquity?: number;
  lines?: ReportLine[];
  /** P3 Batch 7: review-based report metadata */
  source?: "review" | "empty" | "stale";
  diagnostics?: { type: string; message: string }[];
}

export default function ReportTab() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [companyFilter, setCompanyFilter] = useState("02");
  const [yearFilter, setYearFilter] = useState("2025");
  const [monthFilter, setMonthFilter] = useState("12");
  const [reportType, setReportType] = useState<"balance" | "income" | "cashflow">("balance");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, AccountDetail[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/finance/periods").then((r) => r.json()).then((d) => {
      setPeriods(d.periods || []);
    });
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadReport() {
    if (!companyFilter || !yearFilter || !monthFilter) return;
    setLoading(true);
    setExpandedCodes(new Set());
    setDetails({});
    const res = await fetch(`/api/finance/reports?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}&type=${reportType}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  const toggleDetail = useCallback(async (code: string) => {
    if (!code) return;
    const newSet = new Set(expandedCodes);
    if (newSet.has(code)) {
      newSet.delete(code);
      setExpandedCodes(newSet);
      return;
    }
    newSet.add(code);
    setExpandedCodes(newSet);

    if (!details[code]) {
      setLoadingDetail(code);
      try {
        const res = await fetch(`/api/finance/reports/detail?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}&codes=${encodeURIComponent(code)}`);
        if (res.ok) {
          const d = await res.json();
          setDetails((prev) => ({ ...prev, [code]: d.details || [] }));
        }
      } finally {
        setLoadingDetail(null);
      }
    }
  }, [expandedCodes, details, companyFilter, yearFilter, monthFilter]);

  const lineProps = { expandedCodes, details, loadingDetail, onToggle: toggleDetail };

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
            <button onClick={loadReport} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">生成报表</button>
          </>
        }
      />

      {loading && <p className="p-8 text-center text-gray-500">加载中...</p>}

      {data?.type === "balance" && (
        <div className="rounded-lg bg-white shadow-sm p-4">
          <h3 className="text-base font-semibold text-gray-800 text-center mb-1">资 产 负 债 表</h3>
          <p className="text-xs text-gray-500 text-center mb-4">{data.period.year}年{data.period.month}月</p>
          <div className="grid grid-cols-2 gap-0">
            <div className="border-r border-gray-200 pr-4">
              <table className="w-full text-xs">
                <thead className="border-b"><tr>
                  <th className="py-1 text-left font-medium text-gray-700">资  产</th>
                  <th className="py-1 text-right font-medium text-gray-700">年末余额</th>
                </tr></thead>
                <ReportLines items={data.assets || []} {...lineProps} />
              </table>
            </div>
            <div className="pl-4">
              <table className="w-full text-xs">
                <thead className="border-b"><tr>
                  <th className="py-1 text-left font-medium text-gray-700">负债及所有者权益</th>
                  <th className="py-1 text-right font-medium text-gray-700">年末余额</th>
                </tr></thead>
                <ReportLines items={data.liabilities || []} {...lineProps} />
                <ReportLines items={data.equity || []} {...lineProps} />
              </table>
            </div>
          </div>
          {data.totalLiabilitiesAndEquity !== undefined && (
            <p className="text-xs text-gray-400 text-center mt-2">
              资产总计 = {fmt(data.assets?.find((a) => a.isGrandTotal)?.amount || 0)} | 负债和权益总计 = {fmt(data.totalLiabilitiesAndEquity)}
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
          {data.source && data.source !== "review" && (
            <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {data.diagnostics?.map((d) => (
                <p key={d.type}>⚠ {d.message}</p>
              ))}
            </div>
          )}
          <table className="w-full text-xs max-w-2xl mx-auto">
            <thead className="border-b"><tr>
              <th className="py-1 text-left font-medium text-gray-700">项       目</th>
              <th className="py-1 text-right font-medium text-gray-700">本年金额</th>
            </tr></thead>
            <ReportLines items={data.lines || []} {...lineProps} />
          </table>
        </div>
      )}

      {data?.type === "cashflow" && (
        <div className="rounded-lg bg-white shadow-sm p-4">
          <h3 className="text-base font-semibold text-gray-800 text-center mb-1">现 金 流 量 表</h3>
          <p className="text-xs text-gray-500 text-center mb-4">{data.period.year}年{data.period.month}月</p>
          {data.source && data.source !== "review" && (
            <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {data.diagnostics?.map((d) => (
                <p key={d.type}>⚠ {d.message}</p>
              ))}
            </div>
          )}
          <table className="w-full text-xs max-w-2xl mx-auto">
            <thead className="border-b"><tr>
              <th className="py-1 text-left font-medium text-gray-700">项       目</th>
              <th className="py-1 text-right font-medium text-gray-700">金额</th>
            </tr></thead>
            <ReportLines items={data.lines || []} {...lineProps} />
          </table>
        </div>
      )}
    </div>
  );
}
