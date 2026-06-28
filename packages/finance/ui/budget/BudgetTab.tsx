"use client";

import { useMemo, useState } from "react";
import { PageSurface, createBlockSurfaceBlock } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useBudgetData } from "./hooks/useBudgetData";
import { useBudgetFilters } from "./hooks/useBudgetFilters";
import BudgetVersionSelector from "./components/BudgetVersionSelector";
import DeptBudgetFilters from "./components/DeptBudgetFilters";
import DeptBudgetTable from "./components/DeptBudgetTable";
import RdBudgetFilters from "./components/RdBudgetFilters";
import RdBudgetTable from "./components/RdBudgetTable";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";

type BudgetView = "dept" | "rd";

export default function BudgetTab({ user: _user }: { user: SessionUser }) {
  const [view, setView] = useState<BudgetView>("dept");
  const { data, versions, activeVersionId, setActiveVersionId, loading } = useBudgetData(2026);
  const filters = useBudgetFilters(data);
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("budget", _user), [_user]);
  const navigation = activeChildTabs.length > 1 ? {
    kind: "tabs" as const,
    level: 2 as const,
    items: activeChildTabs,
    active: activeChildTabs[0]?.key ?? "",
    onChange: () => {},
  } : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("budget");

  if (loading) {
    return <p className="p-8 text-center text-gray-500">加载中...</p>;
  }

  return (
    <PageSurface
      kind="list"
      navigation={navigation ?? {
        kind: "tabs",
        level: 2,
        items: [
          { key: "dept", label: "部门费用预算" },
          { key: "rd", label: "研发费用预算" },
        ],
        active: view,
        onChange: (key) => setView(key as BudgetView),
      }}
      body={{
        blocks: [
          ...lifecycleBlocks,
          createBlockSurfaceBlock("budget-content", {
            kind: "content",
            content: (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="ml-auto">
                <BudgetVersionSelector
                  versions={versions}
                  activeVersionId={activeVersionId}
                  onChange={setActiveVersionId}
                />
              </div>
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
          </div>
            ),
          }),
        ],
      }}
    />
  );
}
