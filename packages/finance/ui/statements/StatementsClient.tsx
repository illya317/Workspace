"use client";

import { createPageTabBar } from "@workspace/core/ui";
import { Suspense, useMemo, useState } from "react";
import { ConsolidatedReportTab } from "./ConsolidatedReportTab";
import { ConsolidationWorkpaperTab } from "./ConsolidationTabs";
import ReportTab from "./ReportTab";
import type { ConsolidationCapabilities, ConsolidationWorkpaperView } from "./statement-ui-types";
import { STATEMENT_TABS } from "./statement-navigation";
import { useConsolidationOverview } from "./useConsolidationOverview";

type StatementsView = "workpaper" | "statements" | "consolidated";

export default function StatementsClient({ capabilities }: { capabilities: ConsolidationCapabilities }) {
  const [view, setView] = useState<StatementsView>("workpaper");
  const [workpaperView, setWorkpaperView] = useState<ConsolidationWorkpaperView>("overview");
  const consolidation = useConsolidationOverview();
  const navigation = useMemo(() => createPageTabBar({
    items: STATEMENT_TABS,
    active: view,
    onChange: (key) => setView(key as StatementsView),
    activeChild: view === "workpaper" ? workpaperView : undefined,
    onChildChange: (key) => setWorkpaperView(key as ConsolidationWorkpaperView),
    ariaLabel: "财务报表视图",
  }), [view, workpaperView]);
  const subsidiaryCodes = useMemo(
    () => consolidation.data?.entities.filter((entity) => entity.role === "子公司").map((entity) => entity.code) ?? [],
    [consolidation.data],
  );
  const consolidationProps = {
    ...consolidation,
    capabilities,
    onYearChange: consolidation.setYear,
    onMonthChange: consolidation.setMonth,
    onRefresh: consolidation.refresh,
    navigation,
  };
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">加载中...</div>}>
      {view === "workpaper" ? <ConsolidationWorkpaperTab {...consolidationProps} activeView={workpaperView} /> : null}
      {view === "statements" ? <ReportTab navigation={navigation} companyCodes={subsidiaryCodes} /> : null}
      {view === "consolidated" ? <ConsolidatedReportTab {...consolidationProps} /> : null}
    </Suspense>
  );
}
