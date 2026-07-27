"use client";

import {
  createPageTabBar,
  useFeedback,
  type SurfaceToolbarItem,
} from "@workspace/core/ui";
import type { StatementReportType } from "@workspace/finance/types";
import { Suspense, useCallback, useMemo, useState } from "react";
import { ConsolidatedReportTab } from "./ConsolidatedReportTab";
import { ConsolidationPreparationTab } from "./ConsolidationPreparationTab";
import { ConsolidationWorksheetTab } from "./ConsolidationWorksheetTab";
import ReportTab from "./ReportTab";
import { CONSOLIDATED_REPORT_TYPE_OPTIONS } from "./consolidated-report-model";
import { type ConsolidationPeriodKind } from "./consolidation-period";
import { buildConsolidationToolbarItems } from "./consolidation-toolbar";
import type { ConsolidationCapabilities, ConsolidationWorkpaperView } from "./statement-ui-types";
import { STATEMENT_TABS } from "./statement-navigation";
import { useConsolidationOverview } from "./useConsolidationOverview";

type StatementsView = "consolidation" | "statements";

export default function StatementsClient({ capabilities }: { capabilities: ConsolidationCapabilities }) {
  const [view, setView] = useState<StatementsView>("consolidation");
  const [workpaperView, setWorkpaperView] = useState<ConsolidationWorkpaperView>("preparation");
  const [periodKind, setPeriodKind] = useState<ConsolidationPeriodKind>("month");
  const [reportType, setReportType] = useState<StatementReportType>("balanceSheet");
  const feedback = useFeedback();
  const consolidation = useConsolidationOverview(
    periodKind,
    capabilities.canUpdate,
  );
  const { createNextVersion, invalidate, setBatchId } = consolidation;
  const handlePeriodKindChange = useCallback((nextKind: ConsolidationPeriodKind) => {
    invalidate();
    setBatchId(null);
    setPeriodKind(nextKind);
  }, [invalidate, setBatchId]);
  const handleStartWorkpaper = useCallback(() => setWorkpaperView("workpaper"), []);
  const handleWorkpaperConfirmed = useCallback(() => setWorkpaperView("report"), []);
  const navigation = useMemo(() => createPageTabBar({
    items: STATEMENT_TABS,
    active: view,
    onChange: (key) => setView(key as StatementsView),
    activeChild: view === "consolidation" ? workpaperView : undefined,
    onChildChange: (key) => setWorkpaperView(key as ConsolidationWorkpaperView),
    ariaLabel: "财务报表视图",
  }), [view, workpaperView]);
  const currentBatch = consolidation.data?.batch ?? null;
  const latestBatch = consolidation.data?.batchVersions[0] ?? null;
  const canCreateNextVersion = Boolean(
    capabilities.canCreate
    && currentBatch
    && latestBatch?.id === currentBatch.id
    && consolidation.data?.batchCreation.allowed
    && (currentBatch.status === "locked" || currentBatch.status === "published"),
  );
  const handleCreateNextVersion = useCallback(async () => {
    if (!currentBatch) return;
    try {
      const result = await createNextVersion(currentBatch.id);
      feedback.success(result.created
        ? `已创建 V${result.batch.version}`
        : `已切换到 V${result.batch.version}`);
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "新版本创建失败");
    }
  }, [createNextVersion, currentBatch, feedback]);
  const sharedToolbarItems = useMemo(() => buildConsolidationToolbarItems({
    year: consolidation.year,
    month: consolidation.month,
    periodKind,
    loading: consolidation.loading,
    error: consolidation.error,
    batchId: consolidation.selectedBatchId ?? currentBatch?.id ?? null,
    batchVersions: consolidation.data?.batchVersions ?? [],
    onPeriodKindChange: handlePeriodKindChange,
    onPeriodChange: consolidation.setPeriod,
    onBatchChange: consolidation.setBatchId,
    onRefresh: consolidation.refreshSnapshots,
    createVersion: canCreateNextVersion && currentBatch ? {
      nextVersion: currentBatch.version + 1,
      busy: consolidation.creatingVersion,
      onClick: () => void handleCreateNextVersion(),
    } : null,
  }), [
    canCreateNextVersion,
    consolidation.creatingVersion,
    consolidation.data?.batchVersions,
    consolidation.error,
    consolidation.loading,
    consolidation.month,
    consolidation.refreshSnapshots,
    consolidation.selectedBatchId,
    consolidation.setBatchId,
    consolidation.setPeriod,
    consolidation.year,
    currentBatch,
    handleCreateNextVersion,
    handlePeriodKindChange,
    periodKind,
  ]);
  const reportTypeToolbarItem = useMemo<SurfaceToolbarItem>(() => ({
    kind: "select",
    key: "consolidation-report-type",
    label: "报表类型",
    options: CONSOLIDATED_REPORT_TYPE_OPTIONS,
    value: reportType,
    onChange: (value) => setReportType(value as StatementReportType),
  }), [reportType]);
  const consolidationProps = {
    ...consolidation,
    capabilities,
    sharedToolbarItems,
    reportType,
    reportTypeToolbarItem,
    onRefresh: consolidation.refresh,
    onBatchDeleted: consolidation.clearBatchAndRefresh,
    onStartWorkpaper: handleStartWorkpaper,
    onWorkpaperConfirmed: handleWorkpaperConfirmed,
    navigation,
  };
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">加载中...</div>}>
      {view === "consolidation" && workpaperView === "preparation" ? <ConsolidationPreparationTab {...consolidationProps} /> : null}
      {view === "consolidation" && workpaperView === "workpaper" ? <ConsolidationWorksheetTab {...consolidationProps} /> : null}
      {view === "consolidation" && workpaperView === "report" ? <ConsolidatedReportTab {...consolidationProps} /> : null}
      {view === "statements" ? <ReportTab navigation={navigation} canExport={capabilities.canExport} /> : null}
    </Suspense>
  );
}
