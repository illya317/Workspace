"use client";

import { useEffect, useState } from "react";

interface Period {
  id: number;
  year: number;
  month: number;
}

interface ReportLine {
  code: string;
  name: string;
  amount: number;
}

interface ReportData {
  type: string;
  period: Period;
  assets?: ReportLine[];
  liabilities?: ReportLine[];
  equity?: ReportLine[];
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  totalLiabilitiesAndEquity?: number;
  revenue?: ReportLine[];
  cost?: ReportLine[];
  totalRevenue?: number;
  totalCost?: number;
  grossProfit?: number;
  cashAccounts?: ReportLine[] & { opening?: number; closing?: number }[];
  netChange?: number;
}

export default function ReportTab() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [reportType, setReportType] = useState<"balance" | "income" | "cashflow">("balance");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/finance/periods").then((r) => r.json()).then((d) => {
      setPeriods(d.periods || []);
      if (d.periods?.length) setSelectedPeriod(d.periods[0].id);
    });
  }, []);

  async function loadReport() {
    if (!selectedPeriod) return;
    setLoading(true);
    const res = await fetch(`/api/finance/reports?periodId=${selectedPeriod}&type=${reportType}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={selectedPeriod || ""} onChange={(e) => setSelectedPeriod(parseInt(e.target.value) || null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
          <option value="">选择期间</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.year}年{p.month}月</option>)}
        </select>
        <select value={reportType} onChange={(e) => setReportType(e.target.value as "balance" | "income" | "cashflow")} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
          <option value="balance">资产负债表</option>
          <option value="income">利润表</option>
          <option value="cashflow">现金流量表</option>
        </select>
        <button onClick={loadReport} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700">生成报表</button>
      </div>

      {loading && <p className="p-8 text-center text-gray-500">加载中...</p>}

      {data?.type === "balance" && (
        <div className="rounded-lg bg-white shadow-sm p-4 space-y-4">
          <h3 className="text-base font-semibold text-gray-800">资产负债表</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">资产</h4>
              <table className="w-full text-xs"><tbody>
                {data.assets?.map((a) => (
                  <tr key={a.code} className="border-b"><td className="py-1 text-gray-600">{a.code} {a.name}</td><td className="py-1 text-right text-gray-800">{a.amount.toFixed(2)}</td></tr>
                ))}
                <tr className="font-medium"><td className="py-2 text-gray-800">资产合计</td><td className="py-2 text-right text-emerald-700">{data.totalAssets?.toFixed(2)}</td></tr>
              </tbody></table>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">负债</h4>
              <table className="w-full text-xs"><tbody>
                {data.liabilities?.map((a) => (
                  <tr key={a.code} className="border-b"><td className="py-1 text-gray-600">{a.code} {a.name}</td><td className="py-1 text-right text-gray-800">{a.amount.toFixed(2)}</td></tr>
                ))}
                <tr className="font-medium"><td className="py-2 text-gray-800">负债合计</td><td className="py-2 text-right text-emerald-700">{data.totalLiabilities?.toFixed(2)}</td></tr>
              </tbody></table>
              <h4 className="text-sm font-medium text-gray-700 mb-2 mt-4">所有者权益</h4>
              <table className="w-full text-xs"><tbody>
                {data.equity?.map((a) => (
                  <tr key={a.code} className="border-b"><td className="py-1 text-gray-600">{a.code} {a.name}</td><td className="py-1 text-right text-gray-800">{a.amount.toFixed(2)}</td></tr>
                ))}
                <tr className="font-medium"><td className="py-2 text-gray-800">权益合计</td><td className="py-2 text-right text-emerald-700">{data.totalEquity?.toFixed(2)}</td></tr>
              </tbody></table>
              <table className="w-full text-xs mt-2"><tbody>
                <tr className="font-semibold border-t-2 border-gray-300"><td className="py-2 text-gray-800">负债和权益合计</td><td className="py-2 text-right text-emerald-700">{data.totalLiabilitiesAndEquity?.toFixed(2)}</td></tr>
              </tbody></table>
            </div>
          </div>
        </div>
      )}

      {data?.type === "income" && (
        <div className="rounded-lg bg-white shadow-sm p-4 space-y-4">
          <h3 className="text-base font-semibold text-gray-800">利润表</h3>
          <table className="w-full text-xs">
            <tbody>
              {data.revenue?.map((a) => (
                <tr key={a.code} className="border-b"><td className="py-1.5 text-gray-600">{a.code} {a.name}</td><td className="py-1.5 text-right text-gray-800">{a.amount.toFixed(2)}</td></tr>
              ))}
              <tr className="font-medium"><td className="py-2 text-gray-800">营业收入合计</td><td className="py-2 text-right text-emerald-700">{data.totalRevenue?.toFixed(2)}</td></tr>
              {data.cost?.map((a) => (
                <tr key={a.code} className="border-b"><td className="py-1.5 text-gray-600">{a.code} {a.name}</td><td className="py-1.5 text-right text-red-600">{a.amount.toFixed(2)}</td></tr>
              ))}
              <tr className="font-medium"><td className="py-2 text-gray-800">营业成本合计</td><td className="py-2 text-right text-red-600">{data.totalCost?.toFixed(2)}</td></tr>
              <tr className="font-semibold border-t-2 border-gray-300"><td className="py-2 text-gray-800">毛利</td><td className="py-2 text-right text-emerald-700">{data.grossProfit?.toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {data?.type === "cashflow" && (
        <div className="rounded-lg bg-white shadow-sm p-4 space-y-4">
          <h3 className="text-base font-semibold text-gray-800">现金流量表（简化）</h3>
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">科目</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">期初余额</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">期末余额</th>
            </tr></thead>
            <tbody>
              {data.cashAccounts?.map((a: ReportLine & { opening?: number; closing?: number }) => (
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
