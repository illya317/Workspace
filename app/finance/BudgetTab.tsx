"use client";

import { useEffect, useMemo, useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import DeptBudgetFilters from "./components/DeptBudgetFilters";
import DeptBudgetTable from "./components/DeptBudgetTable";
import RdBudgetFilters from "./components/RdBudgetFilters";
import RdBudgetTable from "./components/RdBudgetTable";

// FIXME: accountId/accountCode/accountActive 来自 API 运行时按 name 匹配，不是数据库 FK。
// 同名科目（如不同公司/年度的"其他"）可能匹配到错误记录。
// 如需真 FK，应建预算事实表或映射表持久化 accountId。
export interface DeptBudgetItem {
  dept: string;
  account: string;
  total: number;
  months: number[];
  expenseType: string;
  accountId: number | null;
  accountCode: string | null;
  accountActive: boolean | null;
}

export interface RdBudgetItem {
  project: string;
  category: string;
  total: number;
  months: number[];
  accountId: number | null;
  accountCode: string | null;
  accountActive: boolean | null;
}

interface BudgetData {
  deptBudget: DeptBudgetItem[];
  rdBudget: RdBudgetItem[];
}

type BudgetView = "dept" | "rd";

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
    const set = new Set(data.deptBudget.map((i) => i.expenseType).filter(Boolean));
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
          <DeptBudgetFilters
            deptFilter={deptFilter}
            setDeptFilter={setDeptFilter}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            accountFilter={accountFilter}
            setAccountFilter={setAccountFilter}
            deptOptions={deptOptions}
            typeOptions={typeOptions}
            accountOptions={accountOptions}
            count={filteredDept.length}
            total={deptTotal}
          />
          <DeptBudgetTable items={filteredDept} monthTotals={deptMonthTotals} total={deptTotal} />
        </>
      )}

      {view === "rd" && (
        <>
          <RdBudgetFilters
            projectFilter={projectFilter}
            setProjectFilter={setProjectFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            projectOptions={projectOptions}
            categoryOptions={categoryOptions}
            count={filteredRd.length}
            total={rdTotal}
          />
          <RdBudgetTable items={filteredRd} monthTotals={rdMonthTotals} total={rdTotal} />
        </>
      )}

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
