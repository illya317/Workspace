"use client";

import {
  PageSurface,
  createPageBody,
  createStatusSection,
  useFeedback,
  usePageAssistant,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { useCallback, useMemo, useState } from "react";

import {
  createConsolidatedReportSection,
} from "./consolidated-report-model";
import type { ConsolidationTabProps } from "./statement-ui-types";
import { useConsolidatedReport } from "./useConsolidatedReport";
import { buildConsolidatedStatementAssistantContext } from "./statement-assistant-context";
import { downloadStatementWorkbook } from "./statement-download";

export function ConsolidatedReportTab(props: ConsolidationTabProps) {
  const { data, error: overviewError, loading: overviewLoading, navigation } = props;
  const feedback = useFeedback();
  const pageAssistant = usePageAssistant();
  const reportType = props.reportType;
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
      await downloadStatementWorkbook(
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
      ...props.sharedToolbarItems,
      props.reportTypeToolbarItem,
      {
        kind: "action-group" as const,
        key: "report-actions",
        actions: [
          ...(canExport ? [{
            key: "export",
            label: downloading ? "下载中" : "下载三表",
            kind: "export" as const,
            disabled: downloading || !output.report,
            onClick: () => void downloadWorkbook(),
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
  }), [assistantContext, canExport, downloadWorkbook, downloading, output.report, pageAssistant, parentName, props.reportTypeToolbarItem, props.sharedToolbarItems]);

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
    ] : [];
  }

  return <PageSurface kind="standard" tabbar={navigation} toolbar={toolbar} body={createPageBody(sections)} />;
}
