"use client";

import { useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@workspace/core/hooks";
import { useBudgetData } from "./hooks/useBudgetData";
import { useBudgetFilters } from "./hooks/useBudgetFilters";
import BudgetVersionSelector from "./components/BudgetVersionSelector";
import DeptBudgetFilters from "./components/DeptBudgetFilters";
import DeptBudgetTable from "./components/DeptBudgetTable";
import RdBudgetFilters from "./components/RdBudgetFilters";
import RdBudgetTable from "./components/RdBudgetTable";

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

type BudgetView = "dept" | "rd";

export default function BudgetTab() {
  const [view, setView] = useState<BudgetView>("dept");
  const { toast, closeToast } = useToast();
  const { data, versions, activeVersionId, setActiveVersionId, loading } = useBudgetData(2026);
  const filters = useBudgetFilters(data);

  if (loading) {
    return <p className="p-8 text-center text-gray-500">加载中...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {/* View Switcher */}
        <div className="flex items-center gap-2">
          {(["dept", "rd"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                view === v ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {v === "dept" ? "部门费用预算" : "研发费用预算"}
            </button>
          ))}
        </div>

        {/* Version Selector */}
        <BudgetVersionSelector
          versions={versions}
          activeVersionId={activeVersionId}
          onChange={setActiveVersionId}
        />
      </div>

      {view === "dept" && (
        <>
          <DeptBudgetFilters
            deptFilter={filters.deptFilter}
            setDeptFilter={filters.setDeptFilter}
            typeFilter={filters.typeFilter}
            setTypeFilter={filters.setTypeFilter}
            accountFilter={filters.accountFilter}
            setAccountFilter={filters.setAccountFilter}
            deptOptions={filters.deptOptions}
            typeOptions={filters.typeOptions}
            accountOptions={filters.accountOptions}
            count={filters.filteredDept.length}
            total={filters.deptTotal}
          />
          <DeptBudgetTable
            items={filters.filteredDept}
            monthTotals={filters.deptMonthTotals}
            total={filters.deptTotal}
          />
        </>
      )}

      {view === "rd" && (
        <>
          <RdBudgetFilters
            projectFilter={filters.projectFilter}
            setProjectFilter={filters.setProjectFilter}
            categoryFilter={filters.categoryFilter}
            setCategoryFilter={filters.setCategoryFilter}
            projectOptions={filters.projectOptions}
            categoryOptions={filters.categoryOptions}
            count={filters.filteredRd.length}
            total={filters.rdTotal}
          />
          <RdBudgetTable
            items={filters.filteredRd}
            monthTotals={filters.rdMonthTotals}
            total={filters.rdTotal}
          />
        </>
      )}

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
