"use client";

import { useState } from "react";
import { useToast } from "@workspace/core/hooks";
import { TabBar, Toast, Toolbar, type ToolbarItem } from "@workspace/core/ui";
import { useBudgetData } from "./hooks/useBudgetData";
import { useBudgetFilters } from "./hooks/useBudgetFilters";
import BudgetVersionSelector from "./components/BudgetVersionSelector";
import DeptBudgetFilters from "./components/DeptBudgetFilters";
import DeptBudgetTable from "./components/DeptBudgetTable";
import RdBudgetFilters from "./components/RdBudgetFilters";
import RdBudgetTable from "./components/RdBudgetTable";

type BudgetView = "dept" | "rd";

export default function BudgetTab() {
  const [view, setView] = useState<BudgetView>("dept");
  const { toast, closeToast } = useToast();
  const { data, versions, activeVersionId, setActiveVersionId, loading } = useBudgetData(2026);
  const filters = useBudgetFilters(data);

  if (loading) {
    return <p className="p-8 text-center text-gray-500">加载中...</p>;
  }

  const toolbarItems: ToolbarItem[] = [
    {
      kind: "custom",
      key: "view-tabs",
      section: "view",
      content: (
        <TabBar
          tabs={[
            { key: "dept", label: "部门费用预算" },
            { key: "rd", label: "研发费用预算" },
          ]}
          active={view}
          onChange={(key) => setView(key as BudgetView)}
          className="mb-0"
        />
      ),
    },
    {
      kind: "custom",
      key: "version-selector",
      section: "action",
      content: (
        <BudgetVersionSelector
          versions={versions}
          activeVersionId={activeVersionId}
          onChange={setActiveVersionId}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar items={toolbarItems} className="border-0 bg-transparent p-0 shadow-none" />

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
