"use client";

import { useEffect, useState, useCallback } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";

interface Period {
  id: number;
  year: number;
  month: number;
  isClosed: boolean;
}

interface Balance {
  id: number;
  account: { code: string; name: string; category: string; balanceDirection: string };
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export default function LedgerTab() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast, showToast, closeToast } = useToast();

  useEffect(() => {
    fetch("/api/finance/periods").then((r) => r.json()).then((d) => {
      setPeriods(d.periods || []);
      if (d.periods?.length) setSelectedPeriod(d.periods[0].id);
    });
  }, []);

  const loadBalances = useCallback(async () => {
    if (!selectedPeriod) return;
    setLoading(true);
    const res = await fetch(`/api/finance/balances?periodId=${selectedPeriod}`);
    if (res.ok) {
      const data = await res.json();
      setBalances(data.balances || []);
    }
    setLoading(false);
  }, [selectedPeriod]);

  async function recalc() {
    if (!selectedPeriod) return;
    if (!confirm("确定重新计算该期间余额？")) return;
    const res = await fetch("/api/finance/balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId: selectedPeriod }),
    });
    if (res.ok) {
      showToast("余额计算完成");
      loadBalances();
    } else {
      const err = await res.json().catch(() => ({ error: "计算失败" }));
      showToast(err.error || "计算失败", "error");
    }
  }

  useEffect(() => { loadBalances(); }, [loadBalances]);

  const CATEGORIES: Record<string, string> = { asset: "资产", liability: "负债", equity: "权益", cost: "成本", revenue: "损益" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">科目余额表</h2>
        <div className="flex items-center gap-2">
          <select value={selectedPeriod || ""} onChange={(e) => setSelectedPeriod(parseInt(e.target.value) || null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            <option value="">选择期间</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.year}年{p.month}月 {p.isClosed ? "(已结账)" : ""}</option>)}
          </select>
          <button onClick={recalc} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700">重新计算</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? <p className="p-8 text-center text-gray-500">加载中...</p> : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">科目编码</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">科目名称</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">类别</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">期初借方</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">期初贷方</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">本期借方</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">本期贷方</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">期末借方</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">期末贷方</th>
            </tr></thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-700">{b.account.code}</td>
                  <td className="px-3 py-2 text-gray-700">{b.account.name}</td>
                  <td className="px-3 py-2 text-gray-600">{CATEGORIES[b.account.category]}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{b.openingDebit.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{b.openingCredit.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{b.currentDebit.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{b.currentCredit.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{b.closingDebit.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{b.closingCredit.toFixed(2)}</td>
                </tr>
              ))}
              {balances.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">暂无余额数据，请先录入凭证并计算余额</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <Toast message={toast?.message || ""} type={toast?.type as any} show={!!toast} onClose={closeToast} />
    </div>
  );
}
