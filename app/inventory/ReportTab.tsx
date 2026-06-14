"use client";

import { useEffect, useState } from "react";

interface WarningItem {
  code: string;
  name: string;
  currentStock: number;
  expiryDate?: string;
}

interface WarningData {
  rawMaterials: WarningItem[];
  packaging: WarningItem[];
  finishedGoods: { code: string; name: string; availableStock: number }[];
}

interface LedgerItem {
  code: string;
  name: string;
  lastBalance: number;
  inbound: number;
  outbound: number;
  current: number;
}

interface LedgerData {
  rawMaterials: LedgerItem[];
  packaging: LedgerItem[];
  finishedGoods: LedgerItem[];
}

export default function ReportTab() {
  const [warningData, setWarningData] = useState<WarningData | null>(null);
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [activeReport, setActiveReport] = useState<"warning" | "ledger">("warning");
  const [loading, setLoading] = useState(false);

  async function loadWarning() {
    setLoading(true);
    const res = await fetch("/workspace/api/inventory/reports?type=warning");
    if (res.ok) setWarningData(await res.json());
    setLoading(false);
  }

  async function loadLedger() {
    setLoading(true);
    const res = await fetch("/workspace/api/inventory/reports?type=ledger");
    if (res.ok) setLedgerData(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadWarning(); loadLedger(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setActiveReport("warning")} className={`rounded-md px-4 py-1.5 text-sm ${activeReport === "warning" ? "bg-emerald-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}>预警报表</button>
        <button onClick={() => setActiveReport("ledger")} className={`rounded-md px-4 py-1.5 text-sm ${activeReport === "ledger" ? "bg-emerald-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}>库存台账</button>
      </div>

      {loading && <p className="p-8 text-center text-gray-500">加载中...</p>}

      {activeReport === "warning" && warningData && (
        <div className="space-y-4">
          <div className="rounded-lg bg-white shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">原辅料预警</h3>
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50"><tr><th className="px-3 py-2 text-left">编码</th><th className="px-3 py-2 text-left">名称</th><th className="px-3 py-2 text-right">当前库存</th></tr></thead>
              <tbody>
                {warningData.rawMaterials?.map((r) => (
                  <tr key={r.code} className="border-b"><td className="px-3 py-2 font-mono">{r.code}</td><td className="px-3 py-2">{r.name}</td><td className={`px-3 py-2 text-right ${r.currentStock < 10 ? "text-red-600 font-medium" : ""}`}>{r.currentStock}</td></tr>
                ))}
                {(!warningData.rawMaterials || warningData.rawMaterials.length === 0) && <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">暂无预警</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg bg-white shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">包装材料预警</h3>
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50"><tr><th className="px-3 py-2 text-left">编码</th><th className="px-3 py-2 text-left">名称</th><th className="px-3 py-2 text-right">当前库存</th><th className="px-3 py-2 text-left">有效期</th></tr></thead>
              <tbody>
                {warningData.packaging?.map((p) => (
                  <tr key={p.code} className="border-b"><td className="px-3 py-2 font-mono">{p.code}</td><td className="px-3 py-2">{p.name}</td><td className={`px-3 py-2 text-right ${p.currentStock < 10 ? "text-red-600 font-medium" : ""}`}>{p.currentStock}</td><td className={`px-3 py-2 ${p.expiryDate ? "text-red-600" : ""}`}>{p.expiryDate || "-"}</td></tr>
                ))}
                {(!warningData.packaging || warningData.packaging.length === 0) && <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">暂无预警</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg bg-white shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">成品预警</h3>
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50"><tr><th className="px-3 py-2 text-left">编码</th><th className="px-3 py-2 text-left">名称</th><th className="px-3 py-2 text-right">可发货库存</th></tr></thead>
              <tbody>
                {warningData.finishedGoods?.map((f) => (
                  <tr key={f.code} className="border-b"><td className="px-3 py-2 font-mono">{f.code}</td><td className="px-3 py-2">{f.name}</td><td className={`px-3 py-2 text-right ${f.availableStock < 10 ? "text-red-600 font-medium" : ""}`}>{f.availableStock}</td></tr>
                ))}
                {(!warningData.finishedGoods || warningData.finishedGoods.length === 0) && <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">暂无预警</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === "ledger" && ledgerData && (
        <div className="space-y-4">
          {(["rawMaterials", "packaging", "finishedGoods"] as const).map((cat) => {
            const title = cat === "rawMaterials" ? "原辅料台账" : cat === "packaging" ? "包装材料台账" : "成品台账";
            const data = ledgerData[cat] || [];
            return (
              <div key={cat} className="rounded-lg bg-white shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">{title}</h3>
                <table className="w-full text-xs">
                  <thead className="border-b bg-gray-50"><tr><th className="px-3 py-2 text-left">编码</th><th className="px-3 py-2 text-left">名称</th><th className="px-3 py-2 text-right">上期结存</th><th className="px-3 py-2 text-right">本期入库</th><th className="px-3 py-2 text-right">本期出库</th><th className="px-3 py-2 text-right">当前库存</th></tr></thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.code} className="border-b"><td className="px-3 py-2 font-mono">{row.code}</td><td className="px-3 py-2">{row.name}</td><td className="px-3 py-2 text-right">{row.lastBalance}</td><td className="px-3 py-2 text-right">{row.inbound}</td><td className="px-3 py-2 text-right">{row.outbound}</td><td className="px-3 py-2 text-right font-medium">{row.current}</td></tr>
                    ))}
                    {data.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">暂无数据</td></tr>}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
