"use client";

import {
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  PageSurface,
} from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceTabBarSpec } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";
import { useEffect, useMemo, useRef } from "react";

import {
  COMPARISON_ACCOUNTING_NOTICE,
  createComparisonEmptySections,
  createComparisonFailedSections,
  createComparisonLineDetailSections,
  createComparisonParsingSections,
  createComparisonReadySections,
} from "./statement-comparison-run-sections";
import {
  buildComparisonResultColumns,
  buildComparisonResultFilterToolbarItems,
  buildComparisonTargetToolbarItems,
  createComparisonMappingSections,
  createComparisonPreviewSections,
  createComparisonSummarySection,
} from "./statement-comparison-sections";
import type { ConsolidationCapabilities, StatementComparisonLaunchContext } from "./statement-ui-types";
import { useStatementComparison } from "./useStatementComparison";

/**
 * 差异诊断 tab：实体与合并共用的 Excel 对系统报表对比页。
 * 选择系统报表 → 上传 Excel → 开始对比 → 汇总/过滤/结果表 →
 * 整行选中查看结构化证据（master-detail；无 action 列、无调整/过账动作）。
 */
export default function StatementComparisonTab({
  navigation,
  capabilities,
  launchContext,
  onLaunchHandled,
}: {
  navigation: PageSurfaceTabBarSpec;
  capabilities: ConsolidationCapabilities;
  launchContext: StatementComparisonLaunchContext | null;
  onLaunchHandled: () => void;
}) {
  const comparison = useStatementComparison();
  const companyOptions = useCompanyOptions();
  const appliedLaunchRef = useRef<StatementComparisonLaunchContext | null>(null);

  useEffect(() => {
    if (!launchContext || appliedLaunchRef.current === launchContext) return;
    appliedLaunchRef.current = launchContext;
    comparison.applyLaunchContext(launchContext);
    onLaunchHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchContext, onLaunchHandled]);

  const state = comparison.uiState;
  const targetToolbar = useMemo(() => buildComparisonTargetToolbarItems({
    selection: comparison.selection,
    targetKind: comparison.targetKind,
    companyOptions,
    batchOptions: comparison.batchOptions,
    reportType: comparison.reportType,
    periodKind: comparison.periodKind,
    year: comparison.year,
    month: comparison.month,
    loading: comparison.previewLoading || comparison.uploading || comparison.creatingRun,
    canUploadAndCompare: capabilities.canImport && capabilities.canCreate && capabilities.canUpdate,
    onTargetKindChange: (kind) => comparison.setTargetKind(kind === "consolidated" ? "consolidated" : "entity"),
    onCompanyChange: comparison.setCompanyCode,
    onPeriodChange: comparison.setPeriod,
    onPeriodKindChange: comparison.setPeriodKind,
    onReportTypeChange: (value) => comparison.setReportType(value === "income" ? "income" : value === "cashflow" ? "cashflow" : "balance"),
    onBatchChange: (value) => comparison.setBatchId(value ? Number(value) : null),
    onFileChange: (file) => comparison.uploadAndCompare(file, {
      canUpdate: capabilities.canUpdate,
      canCreate: capabilities.canCreate,
    }),
  }), [capabilities.canCreate, capabilities.canImport, capabilities.canUpdate, companyOptions, comparison]);

  const filterToolbar = useMemo(() => [
    ...buildComparisonResultFilterToolbarItems({
      onlyDifferences: comparison.filter.onlyDifferences,
      status: comparison.filter.status,
      absThreshold: comparison.filter.absThreshold,
      query: comparison.filter.query,
      onOnlyDifferencesChange: (value) => comparison.setFilter({ ...comparison.filter, onlyDifferences: value === "differing" }),
      onStatusChange: (value) => comparison.setFilter({ ...comparison.filter, status: value }),
      onAbsThresholdChange: (value) => comparison.setFilter({ ...comparison.filter, absThreshold: value }),
      onQueryChange: (value) => comparison.setFilter({ ...comparison.filter, query: value }),
    }),
    {
      kind: "action-group" as const,
      key: "comparison-back",
      actions: [{
        key: "back",
        label: "重新对比",
        kind: "view" as const,
        onClick: comparison.closeRun,
      }],
    },
  ], [comparison]);

  const body = useMemo(() => {
    const previewSections = comparison.preview
      ? createComparisonPreviewSections({ preview: comparison.preview, staleMapping: comparison.staleMapping })
      : [];
    switch (state) {
      case "empty":
        return createPageBody(createComparisonEmptySections());
      case "parsing":
        return createPageBody(createComparisonParsingSections());
      case "failed":
        return createPageBody(createComparisonFailedSections({
            message: comparison.uploadError
              ?? comparison.packageDetail?.failureMessage
              ?? comparison.runDetail?.failureMessage
              ?? "操作失败",
            retryHint: "请检查 Excel 文件后重新上传。",
          }));
      case "targetReady":
        return createPageBody(previewSections);
      case "mappingRequired":
        return createPageBody([
          ...previewSections,
          ...createComparisonMappingSections({
            proposals: comparison.packageDetail?.detection?.proposals ?? [],
            selectedProposalIndex: comparison.selectedProposalIndex,
            choices: comparison.mappingChoices,
            canUpdate: capabilities.canUpdate,
            confirming: comparison.confirming,
            remapMode: comparison.remapMode,
            onProposalChange: comparison.setSelectedProposalIndex,
            onChoiceChange: comparison.chooseMapping,
            onConfirm: () => void comparison.confirmMapping(true),
          }),
        ]);
      case "ready":
        return createPageBody([
          ...previewSections,
          ...createComparisonReadySections({
            packageDetail: comparison.packageDetail,
            activeMapping: comparison.activeMapping,
            staleMapping: comparison.staleMapping,
            canCreate: capabilities.canCreate,
            canUpdate: capabilities.canUpdate,
            creatingRun: comparison.creatingRun,
            archiving: comparison.archiving,
            onCreateRun: () => void (comparison.activeMapping
              ? comparison.createRun()
              : comparison.confirmMapping(true)),
            onRemap: comparison.startRemap,
            onArchive: () => void comparison.archivePackage(),
            onSelectRun: (runId) => void comparison.loadRun(runId),
          }),
        ]);
      case "completed": {
        const run = comparison.runDetail;
        if (!run) return createPageBody(createComparisonEmptySections());
        const selectedLine = comparison.selectedLineCode
          ? run.lines.find((line) => line.lineCode === comparison.selectedLineCode) ?? null
          : null;
        const detailSections: BodySurfaceSectionSpec[] = selectedLine
          ? createComparisonLineDetailSections({ line: selectedLine, run })
          : [
              createComparisonSummarySection(run.summary),
              createMessageSection("comparison-select-line", {
                tone: "muted",
                content: `选择左侧整行查看结构化证据。${COMPARISON_ACCOUNTING_NOTICE}`,
              }),
            ];
        return createMasterDetailBody({
          master: {
            label: `对比结果（${comparison.filteredLines.length}/${run.lines.length}）`,
            body: {
              kind: "data",
              data: {
                kind: "table",
                rows: comparison.filteredLines,
                columns: buildComparisonResultColumns(comparison.selectedLineCode),
                visibleColumns: ["lineLabel", "externalAmount", "systemAmount", "differenceAmount", "explanationStatus", "bestSource"],
                rowKey: (row) => row.lineCode,
                onRowClick: (row) => comparison.setSelectedLineCode(
                  row.lineCode === comparison.selectedLineCode ? null : row.lineCode,
                ),
                emptyText: "没有符合过滤条件的对比行",
              },
            },
          },
          detail: createPageBody(detailSections),
          desktop: { ratio: [3, 2] },
        });
      }
    }
  }, [capabilities.canCreate, capabilities.canUpdate, comparison, state]);

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: state === "completed" ? filterToolbar : comparison.operationBusy ? [] : targetToolbar }}
      body={body}
    />
  );
}
