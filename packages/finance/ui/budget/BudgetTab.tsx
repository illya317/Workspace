"use client";

import { useMemo, useState } from "react";
import { PageSurface, createPageBody, createPageTabBar } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useBudgetData } from "./hooks/useBudgetData";
import { useBudgetFilters } from "./hooks/useBudgetFilters";
import { createBudgetVersionSection } from "./components/BudgetVersionSelector";
import { createDeptBudgetSections, createRdBudgetSections } from "./components/BudgetSections";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";

type BudgetView = "dept" | "rd";

export default function BudgetTab({ user: _user }: { user: SessionUser }) {
  const [view, setView] = useState<BudgetView>("dept");
  const { data, versions, activeVersionId, setActiveVersionId, loading } = useBudgetData(2026);
  const filters = useBudgetFilters(data);
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("budget", _user), [_user]);
  const navigation = activeChildTabs.length > 1 ? createPageTabBar({
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
    ? createDeptBudgetSections(filters.dept)
    : createRdBudgetSections(filters.rd);

  return (
    <PageSurface kind="standard"
      tabbar={navigation ?? createPageTabBar({
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
