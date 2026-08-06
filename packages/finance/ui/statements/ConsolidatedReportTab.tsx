"use client";

import {
  PageSurface,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
  usePageAssistant,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { useCallback, useMemo, useState } from "react";
import type { ConsolidatedEquityChangesRow } from "@workspace/finance/types";

import {
  createConsolidatedReportSection,
} from "./consolidated-report-model";
import { mapConsolidatedReportType } from "./statement-comparison-model";
import type { ConsolidationTabProps } from "./statement-ui-types";
import { useConsolidatedReport } from "./useConsolidatedReport";
import { buildConsolidatedStatementAssistantContext } from "./statement-assistant-context";
import { downloadFinanceWorkbook } from "../workbook-download";

const EQUITY_CHANGE_COLUMNS: DataSurfaceColumnSpec<ConsolidatedEquityChangesRow>[] = [
  { key: "item", label: "项目", required: true, width: "xl", cell: (row) => row.label },
  { key: "paidInCapital", label: "实收资本", width: "md", align: "right", cell: (row) => ({ kind: "amount", value: row.paidInCapital }) },
  { key: "capitalReserve", label: "资本公积", width: "md", align: "right", cell: (row) => ({ kind: "amount", value: row.capitalReserve }) },
  { key: "oci", label: "其他综合收益", width: "md", align: "right", cell: (row) => ({ kind: "amount", value: row.otherComprehensiveIncome }) },
  { key: "surplusReserve", label: "盈余公积", width: "md", align: "right", cell: (row) => ({ kind: "amount", value: row.surplusReserve }) },
  { key: "undistributedProfit", label: "未分配利润", width: "md", align: "right", cell: (row) => ({ kind: "amount", value: row.undistributedProfit }) },
  { key: "nci", label: "少数股东权益", required: true, width: "md", align: "right", cell: (row) => ({ kind: "amount", value: row.nonControllingInterests }) },
  { key: "total", label: "所有者权益合计", required: true, width: "md", align: "right", cell: (row) => ({ kind: "amount", value: row.totalEquity }) },
];

export function ConsolidatedReportTab(props: ConsolidationTabProps) {
  const { data, error: overviewError, loading: overviewLoading, navigation } = props;
  const feedback = useFeedback();
  const pageAssistant = usePageAssistant();
  const reportType = props.reportType;
  const onLaunchComparison = props.onLaunchComparison;
  const sharedToolbarItems = props.sharedToolbarItems;
  const reportTypeToolbarItem = props.reportTypeToolbarItem;
  const [downloading, setDownloading] = useState(false);
  const batchStatus = data?.batch?.status ?? null;
  const batchId = data?.batch?.id ?? null;
  const isOfficial = batchStatus === "locked" || batchStatus === "published";
  const scopeYear = data?.scope.year ?? null;
  const scopeMonth = data?.scope.month ?? null;
  const canExport = props.capabilities.canExport;
  const output = useConsolidatedReport(isOfficial ? batchId : null, batchStatus, data?.batch?.revision ?? null);
  const parentName = data?.scope.parent?.name || "合并主体";
  const assistantContext = isOfficial && batchId && scopeYear && scopeMonth ? buildConsolidatedStatementAssistantContext({
    batchId,
    parentName,
    year: scopeYear,
    month: scopeMonth,
    reportType,
  }) : null;
  const downloadWorkbook = useCallback(async () => {
    if (!canExport || !batchId || !scopeYear || !scopeMonth) return;
    setDownloading(true);
    try {
      await downloadFinanceWorkbook(
        workspacePath(`/api/modules/finance/statements/consolidation/batches/${batchId}/report/export`),
        `${parentName}-${scopeYear}.${String(scopeMonth).padStart(2, "0")}-合并报表.xlsx`,
      );
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "合并报表下载失败");
    } finally {
      setDownloading(false);
    }
  }, [batchId, canExport, feedback, parentName, scopeMonth, scopeYear]);
  const toolbar = useMemo(() => ({
    items: [
      ...sharedToolbarItems,
      reportTypeToolbarItem,
      {
        kind: "action-group" as const,
        key: "report-actions",
        actions: [
          ...(canExport ? [{
            key: "export",
            label: downloading ? "下载中" : "下载合并报表",
            kind: "export" as const,
            disabled: downloading || !output.report,
            onClick: () => void downloadWorkbook(),
          }] : []),
          ...(onLaunchComparison ? [{
            key: "comparison",
            label: "差异诊断",
            kind: "view" as const,
            disabled: !isOfficial || !batchId || !data?.scope.parentCompanyId,
            onClick: () => {
              const batch = data?.batch;
              const parentCompanyId = data?.scope.parentCompanyId;
              if (!onLaunchComparison || !batchId || !parentCompanyId || !batch) return;
              onLaunchComparison({
                kind: "consolidated",
                parentCompanyId,
                parentName,
                batchId,
                batchLabel: `批次 #${batchId}（V${batch.version} · ${batchStatus}）`,
                reportType: mapConsolidatedReportType(reportType),
              });
            },
          }] : []),
          {
            key: "assistant",
            label: "页面助手",
            kind: "assistant" as const,
            disabled: !assistantContext,
            onClick: () => {
              if (!assistantContext) return;
              pageAssistant.openAssistant({
                ...assistantContext,
                path: typeof window === "undefined" ? undefined : window.location.pathname,
                title: `${parentName}合并报表`,
              });
            },
          },
        ],
      },
    ],
  }), [assistantContext, batchId, batchStatus, canExport, data?.batch, data?.scope, downloadWorkbook, downloading, isOfficial, onLaunchComparison, output.report, pageAssistant, parentName, reportType, reportTypeToolbarItem, sharedToolbarItems]);

  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = [createStatusSection("consolidated-overview-status", {
      kind: overviewLoading ? "loading" : "error",
      content: overviewLoading ? "正在读取合并批次" : overviewError || "合并批次加载失败",
    })];
  } else if (!data.batch) {
    sections = [createStatusSection("consolidated-report-batch-required", {
      kind: "empty",
      content: "当前期间尚未创建合并批次，请先完成合并准备。",
    })];
  } else if (!isOfficial) {
    sections = [createStatusSection("consolidated-report-not-official", {
      kind: "empty",
      content: "正式合并报表仅展示已确认锁定或已发布批次。确认前请在“合并工作底稿”查看预览。",
    })];
  } else if (output.loading) {
    sections = [createStatusSection("consolidated-report-loading", { kind: "loading", content: "正在读取正式合并报表" })];
  } else if (!output.report) {
    sections = output.error
      ? [createStatusSection("consolidated-report-error", { kind: "error", content: output.error })]
      : [];
  } else {
    const statement = output.report.statements.find((item) => item.reportType === reportType)
      ?? output.report.statements[0];
    sections = statement ? [
      createConsolidatedReportSection(statement, {
        parentName,
        year: data.scope.year,
        month: data.scope.month,
      }),
      ...(reportType === "balanceSheet" && output.report.equityChanges ? [{
        ...createPageTableSection("consolidated-equity-changes", {
          rows: output.report.equityChanges.rows,
          columns: EQUITY_CHANGE_COLUMNS,
          visibleColumns: EQUITY_CHANGE_COLUMNS.map((column) => column.key),
          rowKey: (row) => row.key,
          rowState: (row) => row.key === "opening" || row.key === "closing" ? "total" as const : "normal" as const,
          presentation: { density: "compact" as const, cellWrap: "nowrap" as const },
          scroll: { x: true },
          emptyText: "当前期间没有所有者权益变动",
        }),
        header: { title: output.report.equityChanges.status === "reconciled" ? "合并所有者权益变动表" : "合并所有者权益变动表 · 存在待分类差异" },
      }] : []),
    ] : [];
  }

  return <PageSurface kind="standard" tabbar={navigation} toolbar={toolbar} body={createPageBody(sections)} />;
}
