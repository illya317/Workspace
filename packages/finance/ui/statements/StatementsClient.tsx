"use client";

import { createPageTabBar, type PageSurfaceTabBarItemSpec } from "@workspace/core/ui";
import { Suspense, useMemo, useState } from "react";
import { ConsolidatedReportTab, ConsolidationWorkpaperTab } from "./ConsolidationTabs";
import ReportTab from "./ReportTab";
import { useConsolidationOverview } from "./useConsolidationOverview";

type StatementsView = "workpaper" | "statements" | "consolidated";

const STATEMENT_TABS: PageSurfaceTabBarItemSpec[] = [
  { key: "workpaper", label: "合并报表底稿" },
  { key: "statements", label: "财务报表" },
  { key: "consolidated", label: "合并报表" },
];

export default function StatementsClient() {
  const [view, setView] = useState<StatementsView>("workpaper");
  const consolidation = useConsolidationOverview();
  const navigation = useMemo(() => createPageTabBar({
    items: STATEMENT_TABS,
    active: view,
    onChange: (key) => setView(key as StatementsView),
    ariaLabel: "财务报表视图",
  }), [view]);
  const subsidiaryCodes = useMemo(
    () => consolidation.data?.entities.filter((entity) => entity.role === "子公司").map((entity) => entity.code) ?? [],
    [consolidation.data],
  );
  const consolidationProps = {
    ...consolidation,
    onYearChange: consolidation.setYear,
    onMonthChange: consolidation.setMonth,
    navigation,
  };
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">加载中...</div>}>
      {view === "workpaper" ? <ConsolidationWorkpaperTab {...consolidationProps} /> : null}
      {view === "statements" ? <ReportTab navigation={navigation} companyCodes={subsidiaryCodes} /> : null}
      {view === "consolidated" ? <ConsolidatedReportTab {...consolidationProps} /> : null}
    </Suspense>
  );
}
