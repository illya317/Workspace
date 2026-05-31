"use client";

import { useEffect, useState, useCallback } from "react";
import FinanceFilters from "../components/FinanceFilters";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

interface AccountDetail {
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closing: number;
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

const CATEGORIES: Record<string, string> = { asset: "资产", liability: "负债", equity: "权益", cost: "成本", revenue: "损益" };

function renderAmount(v: number) {
  if (Math.abs(v) < 0.01) return <span className="text-gray-300">—</span>;
  const neg = v < 0;
  return <span className={neg ? "text-red-600" : "text-gray-800"}>{neg ? "-" : ""}{fmt(Math.abs(v))}</span>;
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

  function renderLine(item: ReportLine, i: number) {
    const hasCode = !!item.code;
    const isExpanded = hasCode && expandedCodes.has(item.code!);
    const detailRows = hasCode ? details[item.code!] : undefined;

    return (
      <tbody key={i}>
        <tr
          className={`border-b cursor-pointer hover:bg-gray-50 transition-colors ${
            item.isGrandTotal ? "border-t-2 border-gray-300 font-bold" :
            item.isTotal ? "font-medium bg-gray-50" :
            item.isHeader ? "font-medium text-gray-700" : "text-gray-600"
          }`}
          onClick={() => hasCode && toggleDetail(item.code!)}
        >
          <td className={`py-1 ${item.isHeader ? "text-gray-700" : item.isTotal || item.isGrandTotal ? "text-gray-800" : "pl-4"}`}>
            <span className="flex items-center gap-1">
              {hasCode && <span className="text-gray-300 text-[10px]">{isExpanded ? "▼" : "▶"}</span>}
              {item.label}
            </span>
          </td>
          <td className="py-1 text-right">{renderAmount(item.amount)}</td>
        </tr>
        {isExpanded && (
          <tr key={`${i}-detail`}>
            <td colSpan={2} className="bg-gray-50 px-4 py-2">
              {loadingDetail === item.code ? (
                <p className="text-xs text-gray-400 py-2">加载明细...</p>
              ) : detailRows && detailRows.length > 0 ? (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="text-left py-1 font-medium">科目编码</th>
                      <th className="text-left py-1 font-medium">科目名称</th>
                      <th className="text-right py-1 font-medium">期初借</th>
                      <th className="text-right py-1 font-medium">期初贷</th>
                      <th className="text-right py-1 font-medium">本期借</th>
                      <th className="text-right py-1 font-medium">本期贷</th>
                      <th className="text-right py-1 font-medium">期末余额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((d) => (
                      <tr key={d.code} className="border-b border-gray-100">
                        <td className="py-1 font-mono text-gray-600">{d.code}</td>
                        <td className="py-1 text-gray-700">{d.name}</td>
                        <td className="py-1 text-right text-gray-600">{d.openingDebit > 0 ? fmt(d.openingDebit) : ""}</td>
                        <td className="py-1 text-right text-gray-600">{d.openingCredit > 0 ? fmt(d.openingCredit) : ""}</td>
                        <td className="py-1 text-right text-gray-600">{d.currentDebit > 0 ? fmt(d.currentDebit) : ""}</td>
                        <td className="py-1 text-right text-gray-600">{d.currentCredit > 0 ? fmt(d.currentCredit) : ""}</td>
                        <td className={`py-1 text-right font-medium ${d.closing < 0 ? "text-red-600" : "text-gray-800"}`}>
                          {fmt(Math.abs(d.closing))}{d.balanceDirection === "credit" && d.closing !== 0 ? " (贷)" : ""}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-medium">
                      <td colSpan={6} className="py-1 text-right text-gray-600">合计</td>
                      <td className="py-1 text-right text-gray-800">{fmt(Math.abs(detailRows.reduce((s, d) => s + d.closing, 0)))}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-gray-400 py-2">无明细数据</p>
              )}
            </td>
          </tr>
        )}
      </tbody>
    );
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
                {data.assets?.map((item, i) => renderLine(item, i))}
              </table>
            </div>
            <div className="pl-4">
              <table className="w-full text-xs">
                <thead className="border-b"><tr>
                  <th className="py-1 text-left font-medium text-gray-700">负债及所有者权益</th>
                  <th className="py-1 text-right font-medium text-gray-700">年末余额</th>
                </tr></thead>
                {data.liabilities?.map((item, i) => renderLine(item, i))}
                {data.equity?.map((item, i) => renderLine(item, i))}
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
          <table className="w-full text-xs max-w-2xl mx-auto">
            <thead className="border-b"><tr>
              <th className="py-1 text-left font-medium text-gray-700">项       目</th>
              <th className="py-1 text-right font-medium text-gray-700">本年金额</th>
            </tr></thead>
            {data.lines?.map((item, i) => renderLine(item, i))}
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
                  <td className="px-3 py-2 text-right text-gray-700">{fmt(a.opening || 0)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmt(a.closing || 0)}</td>
                </tr>
              ))}
              <tr className="font-semibold border-t-2 border-gray-300">
                <td className="px-3 py-2 text-gray-800">现金及等价物净增加额</td>
                <td className="px-3 py-2 text-right" />
                <td className="px-3 py-2 text-right text-emerald-700">{fmt(data.netChange || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
