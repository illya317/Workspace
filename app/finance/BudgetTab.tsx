"use client";

import { useEffect, useMemo, useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";

interface DeptBudgetItem {
  dept: string;
  account: string;
  total: number;
  months: number[];
  expenseType: string;
}

interface RdBudgetItem {
  project: string;
  category: string;
  total: number;
  months: number[];
}

interface BudgetData {
  deptBudget: DeptBudgetItem[];
  rdBudget: RdBudgetItem[];
}

type BudgetView = "dept" | "rd";

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

export default function BudgetTab() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<BudgetView>("dept");
  const { toast, showToast, closeToast } = useToast();

  // Dept filters
  const [deptFilter, setDeptFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");

  // R&D filters
  const [projectFilter, setProjectFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => {
    fetch("/api/finance/budget")
      .then((r) => r.json())
      .then((d: BudgetData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        showToast("加载预算数据失败", "error");
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deptOptions = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.deptBudget.map((i) => i.dept));
    return [...set].sort();
  }, [data]);

  const typeOptions = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.deptBudget.map((i) => i.expenseType));
    return [...set].sort();
  }, [data]);

  const accountOptions = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.deptBudget.map((i) => i.account));
    return [...set].sort();
  }, [data]);

  const projectOptions = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.rdBudget.map((i) => i.project));
    return [...set].sort();
  }, [data]);

  const categoryOptions = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.rdBudget.map((i) => i.category));
    return [...set].sort();
  }, [data]);

  const filteredDept = useMemo(() => {
    if (!data) return [];
    return data.deptBudget.filter((i) => {
      if (deptFilter && i.dept !== deptFilter) return false;
      if (typeFilter && i.expenseType !== typeFilter) return false;
      if (accountFilter && i.account !== accountFilter) return false;
      return true;
    });
  }, [data, deptFilter, typeFilter, accountFilter]);

  const filteredRd = useMemo(() => {
    if (!data) return [];
    return data.rdBudget.filter((i) => {
      if (projectFilter && i.project !== projectFilter) return false;
      if (categoryFilter && i.category !== categoryFilter) return false;
      return true;
    });
  }, [data, projectFilter, categoryFilter]);

  const deptTotal = useMemo(() => {
    return filteredDept.reduce((s, i) => s + i.total, 0);
  }, [filteredDept]);

  const deptMonthTotals = useMemo(() => {
    const totals = new Array(12).fill(0);
    for (const i of filteredDept) {
      for (let m = 0; m < 12; m++) totals[m] += i.months[m];
    }
    return totals;
  }, [filteredDept]);

  const rdTotal = useMemo(() => {
    return filteredRd.reduce((s, i) => s + i.total, 0);
  }, [filteredRd]);

  const rdMonthTotals = useMemo(() => {
    const totals = new Array(12).fill(0);
    for (const i of filteredRd) {
      for (let m = 0; m < 12; m++) totals[m] += i.months[m];
    }
    return totals;
  }, [filteredRd]);

  if (loading) {
    return <p className="p-8 text-center text-gray-500">加载中...</p>;
  }

  return (
    <div className="space-y-4">
      {/* View Switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView("dept")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            view === "dept"
              ? "bg-emerald-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          部门费用预算
        </button>
        <button
          onClick={() => setView("rd")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            view === "rd"
              ? "bg-emerald-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          研发费用预算
        </button>
      </div>

      {view === "dept" && (
        <>
          {/* Dept Filters */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">部门</label>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
              >
                <option value="">全部部门</option>
                {deptOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">费用类型</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
              >
                <option value="">全部类型</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">科目</label>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
              >
                <option value="">全部科目</option>
                {accountOptions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <span className="text-xs text-gray-400">
              共 {filteredDept.length} 条，合计 {deptTotal.toFixed(2)} 万元
            </span>
          </div>

          {/* Dept Budget Table */}
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">部门</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">科目</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">费用类型</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">{m}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">合计</th>
                </tr>
              </thead>
              <tbody>
                {filteredDept.map((item, idx) => (
                  <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{item.dept}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{item.account}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${
                        item.expenseType === "管理费用"
                          ? "bg-blue-100 text-blue-700"
                          : item.expenseType === "销售费用"
                          ? "bg-orange-100 text-orange-700"
                          : item.expenseType === "研发费用"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {item.expenseType}
                      </span>
                    </td>
                    {item.months.map((v, m) => (
                      <td key={m} className={`px-2 py-2 text-right whitespace-nowrap ${v > 0 ? "text-gray-700" : "text-gray-300"}`}>
                        {v > 0 ? v.toFixed(2) : ""}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-medium text-gray-800 whitespace-nowrap">{item.total.toFixed(2)}</td>
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="border-t-2 border-gray-200 bg-gray-100 font-medium">
                  <td className="px-3 py-2 text-gray-800" colSpan={3}>合计</td>
                  {deptMonthTotals.map((v, m) => (
                    <td key={m} className="px-2 py-2 text-right text-gray-800">{v.toFixed(2)}</td>
                  ))}
                  <td className="px-3 py-2 text-right text-emerald-700">{deptTotal.toFixed(2)}</td>
                </tr>
                {filteredDept.length === 0 && (
                  <tr>
                    <td colSpan={16} className="px-3 py-8 text-center text-gray-400">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === "rd" && (
        <>
          {/* R&D Filters */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">研发项目</label>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
              >
                <option value="">全部项目</option>
                {projectOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">产品类别</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
              >
                <option value="">全部类别</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <span className="text-xs text-gray-400">
              共 {filteredRd.length} 条，合计 {rdTotal.toFixed(2)} 万元
            </span>
          </div>

          {/* R&D Budget Table */}
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">研发项目</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">产品类别</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">{m}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">合计</th>
                </tr>
              </thead>
              <tbody>
                {filteredRd.map((item, idx) => (
                  <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{item.project}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{item.category}</td>
                    {item.months.map((v, m) => (
                      <td key={m} className={`px-2 py-2 text-right whitespace-nowrap ${v > 0 ? "text-gray-700" : "text-gray-300"}`}>
                        {v > 0 ? v.toFixed(2) : ""}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-medium text-gray-800 whitespace-nowrap">{item.total.toFixed(2)}</td>
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="border-t-2 border-gray-200 bg-gray-100 font-medium">
                  <td className="px-3 py-2 text-gray-800" colSpan={2}>合计</td>
                  {rdMonthTotals.map((v, m) => (
                    <td key={m} className="px-2 py-2 text-right text-gray-800">{v.toFixed(2)}</td>
                  ))}
                  <td className="px-3 py-2 text-right text-emerald-700">{rdTotal.toFixed(2)}</td>
                </tr>
                {filteredRd.length === 0 && (
                  <tr>
                    <td colSpan={15} className="px-3 py-8 text-center text-gray-400">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
