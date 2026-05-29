"use client";

import { useEffect, useState, useCallback } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import FinanceFilters from "./components/FinanceFilters";

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

interface Company {
  code: string;
  name: string;
}

interface ReconcileDiff {
  accountCode: string;
  accountName: string;
  field: string;
  excelValue: number;
  systemValue: number;
  diff: number;
}

interface ReconcileResult {
  year: number;
  monthStart: number;
  monthEnd: number;
  companyCode: string;
  excelRowCount: number;
  systemAccountCount: number;
  matchedCount: number;
  differences: ReconcileDiff[];
  missingInSystem: { code: string; name: string }[];
  missingInExcel: { code: string; name: string }[];
}

export default function LedgerTab() {
  const [_periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast, showToast, closeToast } = useToast();

  // 筛选
  const [companyFilter, setCompanyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  // 余额核对状态
  const [companies, setCompanies] = useState<Company[]>([]);
  const [reconcileCompany, setReconcileCompany] = useState("");
  const [reconcileFile, setReconcileFile] = useState<File | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);

  useEffect(() => {
    fetch("/api/finance/periods").then((r) => r.json()).then((d) => {
      const list = d.periods || [];
      setPeriods(list);
      // 默认选中第一个期间
      if (list.length && !companyFilter && !yearFilter && !monthFilter) {
        const first = list[0];
        if (first.companyCode) setCompanyFilter(first.companyCode);
        setYearFilter(String(first.year));
        setMonthFilter(String(first.month));
      }
    });
    fetch("/api/hr/companies").then((r) => r.json()).then((d) => {
      const list = d.companies || [];
      setCompanies(list);
      if (list.length) setReconcileCompany(list[0].code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBalances = useCallback(async () => {
    if (!companyFilter || !yearFilter || !monthFilter) {
      setBalances([]);
      setSelectedPeriodId(null);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/finance/balances?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}`);
    if (res.ok) {
      const data = await res.json();
      setBalances(data.balances || []);
      setSelectedPeriodId(data.periodId || null);
    }
    setLoading(false);
  }, [companyFilter, yearFilter, monthFilter]);

  async function recalc() {
    if (!selectedPeriodId) return;
    if (!confirm("确定重新计算该期间余额？")) return;
    const res = await fetch("/api/finance/balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId: selectedPeriodId }),
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

  async function handleReconcile() {
    if (!reconcileFile || !reconcileCompany) {
      showToast("请选择公司和余额表文件", "error");
      return;
    }
    setReconcileLoading(true);
    setReconcileResult(null);
    const formData = new FormData();
    formData.append("file", reconcileFile);
    formData.append("companyCode", reconcileCompany);
    try {
      const res = await fetch("/api/finance/balances/reconcile", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setReconcileResult(data.result);
      } else {
        showToast(data.error || "核对失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    } finally {
      setReconcileLoading(false);
    }
  }

  const CATEGORIES: Record<string, string> = { asset: "资产", liability: "负债", equity: "权益", cost: "成本", revenue: "损益" };

  return (
    <div className="space-y-4">
      <FinanceFilters
        companyFilter={companyFilter}
        yearFilter={yearFilter}
        monthFilter={monthFilter}
        pageSize={50}
        onCompanyChange={setCompanyFilter}
        onYearChange={setYearFilter}
        onMonthChange={setMonthFilter}
        onPageSizeChange={() => {}}
        showPageSize={false}
        extra={
          <>
            <button onClick={recalc} disabled={!selectedPeriodId} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">重新计算</button>
            <span className="ml-auto text-xs text-gray-400">共 {balances.length} 条</span>
          </>
        }
      />

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

      {/* 余额核对 */}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold text-gray-800">余额核对（与Excel余额表比对）</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">公司</label>
            <select value={reconcileCompany} onChange={(e) => setReconcileCompany(e.target.value)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
              {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">余额表Excel</label>
            <input type="file" accept=".xls,.xlsx" onChange={(e) => setReconcileFile(e.target.files?.[0] || null)} className="text-sm" />
          </div>
          <button onClick={handleReconcile} disabled={reconcileLoading} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            {reconcileLoading ? "核对中..." : "开始核对"}
          </button>
        </div>

        {reconcileResult && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-gray-600">期间：<span className="font-medium text-gray-800">{reconcileResult.year}年{reconcileResult.monthStart}月-{reconcileResult.monthEnd}月</span></span>
              <span className="text-gray-600">Excel科目数：<span className="font-medium text-gray-800">{reconcileResult.excelRowCount}</span></span>
              <span className="text-gray-600">系统科目数：<span className="font-medium text-gray-800">{reconcileResult.systemAccountCount}</span></span>
              <span className="text-gray-600">一致科目数：<span className="font-medium text-green-600">{reconcileResult.matchedCount}</span></span>
              <span className="text-gray-600">差异科目数：<span className="font-medium text-red-600">{reconcileResult.differences.length}</span></span>
            </div>

            {reconcileResult.missingInSystem.length > 0 && (
              <div className="rounded-md bg-yellow-50 p-3 text-sm">
                <p className="font-medium text-yellow-800">Excel中有但系统中缺失的科目（{reconcileResult.missingInSystem.length}个）：</p>
                <p className="mt-1 text-yellow-700">{reconcileResult.missingInSystem.map((m) => `${m.code} ${m.name}`).join("、 ")}</p>
              </div>
            )}

            {reconcileResult.missingInExcel.length > 0 && (
              <div className="rounded-md bg-blue-50 p-3 text-sm">
                <p className="font-medium text-blue-800">系统中有但Excel中缺失的科目（{reconcileResult.missingInExcel.length}个）：</p>
                <p className="mt-1 text-blue-700">{reconcileResult.missingInExcel.map((m) => `${m.code} ${m.name}`).join("、 ")}</p>
              </div>
            )}

            {reconcileResult.differences.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b bg-red-50"><tr>
                    <th className="px-2 py-1.5 text-left font-medium text-red-800">科目编码</th>
                    <th className="px-2 py-1.5 text-left font-medium text-red-800">科目名称</th>
                    <th className="px-2 py-1.5 text-left font-medium text-red-800">差异项</th>
                    <th className="px-2 py-1.5 text-right font-medium text-red-800">Excel</th>
                    <th className="px-2 py-1.5 text-right font-medium text-red-800">系统</th>
                    <th className="px-2 py-1.5 text-right font-medium text-red-800">差额</th>
                  </tr></thead>
                  <tbody>
                    {reconcileResult.differences.map((d, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-2 py-1.5 font-mono text-gray-700">{d.accountCode}</td>
                        <td className="px-2 py-1.5 text-gray-700">{d.accountName}</td>
                        <td className="px-2 py-1.5 text-gray-600">{d.field}</td>
                        <td className="px-2 py-1.5 text-right text-gray-700">{d.excelValue.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-700">{d.systemValue.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right font-medium text-red-600">{d.diff.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reconcileResult.differences.length === 0 && reconcileResult.missingInSystem.length === 0 && reconcileResult.missingInExcel.length === 0 && (
              <p className="rounded-md bg-green-50 p-3 text-sm font-medium text-green-700">✓ 核对通过，所有科目余额完全一致</p>
            )}
          </div>
        )}
      </div>

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
