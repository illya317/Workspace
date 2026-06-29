"use client";

import { useMemo, useState } from "react";
import { PageSurface, createPageBody, createPageTabsNavigation } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useBudgetData } from "./hooks/useBudgetData";
import { useBudgetFilters } from "./hooks/useBudgetFilters";
import { createBudgetVersionSection } from "./components/BudgetVersionSelector";
import { createDeptBudgetFilterSections } from "./components/DeptBudgetFilters";
import { createDeptBudgetTableSection } from "./components/DeptBudgetTable";
import { createRdBudgetFilterSections } from "./components/RdBudgetFilters";
import { createRdBudgetTableSection } from "./components/RdBudgetTable";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";

type BudgetView = "dept" | "rd";

export default function BudgetTab({ user: _user }: { user: SessionUser }) {
  const [view, setView] = useState<BudgetView>("dept");
  const { data, versions, activeVersionId, setActiveVersionId, loading } = useBudgetData(2026);
  const filters = useBudgetFilters(data);
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("budget", _user), [_user]);
  const navigation = activeChildTabs.length > 1 ? createPageTabsNavigation({
    items: activeChildTabs,
    active: activeChildTabs[0]?.key ?? "",
    onChange: () => {},
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("budget");

  if (loading) {
    return <p className="p-8 text-center text-gray-500">加载中...</p>;
  }
  const versionSection = createBudgetVersionSection({ versions, activeVersionId, onChange: setActiveVersionId });
  const viewSections = view === "dept"
    ? [
        ...createDeptBudgetFilterSections({
          deptFilter: filters.deptFilter,
          setDeptFilter: filters.setDeptFilter,
          typeFilter: filters.typeFilter,
          setTypeFilter: filters.setTypeFilter,
          accountFilter: filters.accountFilter,
          setAccountFilter: filters.setAccountFilter,
          deptOptions: filters.deptOptions,
          typeOptions: filters.typeOptions,
          accountOptions: filters.accountOptions,
          count: filters.filteredDept.length,
          total: filters.deptTotal,
        }),
        createDeptBudgetTableSection({
          items: filters.filteredDept,
          monthTotals: filters.deptMonthTotals,
          total: filters.deptTotal,
        }),
      ]
    : [
        ...createRdBudgetFilterSections({
          projectFilter: filters.projectFilter,
          setProjectFilter: filters.setProjectFilter,
          categoryFilter: filters.categoryFilter,
          setCategoryFilter: filters.setCategoryFilter,
          projectOptions: filters.projectOptions,
          categoryOptions: filters.categoryOptions,
          count: filters.filteredRd.length,
          total: filters.rdTotal,
        }),
        createRdBudgetTableSection({
          items: filters.filteredRd,
          monthTotals: filters.rdMonthTotals,
          total: filters.rdTotal,
        }),
      ];

  return (
    <PageSurface kind="standard"
      navigation={navigation ?? createPageTabsNavigation({
        items: [
          { key: "dept", label: "部门费用预算" },
          { key: "rd", label: "研发费用预算" },
        ],
        active: view,
        onChange: (key) => setView(key as BudgetView),
      })}
      body={createPageBody([
          ...lifecycleBlocks,
          ...(versionSection ? [versionSection] : []),
          ...viewSections,
        ])}
    />
  );
}
