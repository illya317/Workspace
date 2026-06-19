"use client";

import { useEffect, useState, useCallback } from "react";
import Toast from "@workspace/core/ui/Toast";
import { PanelCard } from "@workspace/core/ui";
import { useToast } from "@workspace/core/hooks";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
import { FinanceBalanceReconcile } from "@workspace/finance/ui";

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

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LedgerTab() {
  const [_periods, setPeriods] = useState<Period[]>([]);
  const [_selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const { toast, showToast, closeToast } = useToast();

  // 筛选
  const [companyFilter, setCompanyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  useEffect(() => {
    fetch("/workspace/api/finance/periods").then((r) => r.json()).then((d) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBalances = useCallback(async () => {
    if (!companyFilter || !yearFilter || !monthFilter) {
      setBalances([]);
      setSelectedPeriodId(null);
      setTotal(0);
      setTotalPages(1);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    params.set("companyCode", companyFilter);
    params.set("year", yearFilter);
    params.set("month", monthFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const res = await fetch(`/workspace/api/finance/balances?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setBalances(data.data || data.balances || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setSelectedPeriodId(data.periodId || null);
    }
    setLoading(false);
  }, [companyFilter, yearFilter, monthFilter, page, pageSize]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  const CATEGORIES: Record<string, string> = { asset: "资产", liability: "负债", equity: "权益", cost: "成本", revenue: "损益" };

  return (
    <div className="space-y-4">
      <FinanceFilters
        companyFilter={companyFilter}
        yearFilter={yearFilter}
        monthFilter={monthFilter}
        pageSize={pageSize}
        onCompanyChange={(v) => { setCompanyFilter(v); setPage(1); }}
        onYearChange={(v) => { setYearFilter(v); setPage(1); }}
        onMonthChange={(v) => { setMonthFilter(v); setPage(1); }}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
        extra={
          <span className="ml-auto text-xs text-gray-400">共 {total} 条</span>
        }
      />

      <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
        {loading ? <p className="p-8 text-center text-gray-500">加载中...</p> : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr>
              <th className="whitespace-nowrap px-4 py-3 font-medium">科目编码</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">科目名称</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">类别</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-medium">期初借方</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-medium">期初贷方</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-medium">本期借方</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-medium">本期贷方</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-medium">期末借方</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-medium">期末贷方</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {balances.map((b) => (
                <tr key={b.id} className="hover:bg-emerald-50/20">
                  <td className="px-4 py-3 font-mono text-slate-700">{b.account.code}</td>
                  <td className="px-4 py-3 text-slate-800">{b.account.name}</td>
                  <td className="px-4 py-3 text-slate-600">{CATEGORIES[b.account.category]}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmt(b.openingDebit)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmt(b.openingCredit)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmt(b.currentDebit)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmt(b.currentCredit)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmt(b.closingDebit)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmt(b.closingCredit)}</td>
                </tr>
              ))}
              {balances.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">暂无余额数据，请先录入凭证并计算余额</td></tr>}
            </tbody>
          </table>
        )}
      </PanelCard>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      <FinanceBalanceReconcile showToast={showToast} />

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
