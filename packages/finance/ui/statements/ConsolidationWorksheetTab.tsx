"use client";

import {
  PageSurface,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
  type BodySurfaceSectionSpec,
  type DataSurfaceCellSpec,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import type {
  ConsolidatedOutputLine,
  ConsolidationEntrySnapshot,
  StatementReportType,
} from "@workspace/finance/types";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  consolidationWorkpaperAdjustmentAmounts,
  consolidationWorkpaperEntryEffects,
  consolidationWorkpaperLines,
  type ConsolidationWorkpaperEntryEffect,
} from "./consolidation-workpaper-model";
import type { ConsolidationTabProps } from "./statement-ui-types";
import { useConsolidatedReport } from "./useConsolidatedReport";
import { downloadStatementWorkbook } from "./statement-download";
import { useConsolidationDecisionWorkspace } from "./useConsolidationDecisionWorkspace";

const ENTRY_EFFECT_COLUMNS: DataSurfaceColumnSpec<ConsolidationWorkpaperEntryEffect>[] = [
  { key: "entry", label: "抵销分录", required: true, width: "lg", cell: (row) => row.title },
  { key: "type", label: "类别", width: "md", cell: (row) => row.typeLabel },
  { key: "company", label: "主体", width: "sm", cell: (row) => row.companyCode },
  { key: "debit", label: "借方", width: "md", cell: (row) => ({ kind: "amount", value: row.debit }) },
  { key: "credit", label: "贷方", width: "md", cell: (row) => ({ kind: "amount", value: row.credit }) },
  { key: "effect", label: "对合并数影响", required: true, width: "md", cell: (row) => ({ kind: "amount", value: row.amount }) },
  { key: "note", label: "说明", width: "lg", cell: (row) => row.note || "—" },
];

function expandedWorkpaperRow(
  entries: readonly ConsolidationEntrySnapshot[],
  reportType: StatementReportType,
  line: ConsolidatedOutputLine,
): DataSurfaceCellSpec {
  const effects = consolidationWorkpaperEntryEffects(entries, reportType, line);
  return {
    kind: "group",
    direction: "column",
    items: [
      { kind: "text", value: "下列为直接写入本报表行的集团凭证；批次锁定后随报表一并冻结。", tone: "muted", wrap: "wrap" },
      { kind: "data", data: {
        kind: "table",
        rows: effects,
        columns: ENTRY_EFFECT_COLUMNS,
        visibleColumns: ENTRY_EFFECT_COLUMNS.map((column) => column.key),
        rowKey: (row) => row.key,
        presentation: { density: "compact", cellWrap: "wrap", header: "plain" },
        emptyText: "本行没有直接抵销分录，金额可能由合计或系统派生规则形成",
      } },
    ],
  };
}

export function ConsolidationWorksheetTab(props: ConsolidationTabProps) {
  const { data, error: overviewError, loading: overviewLoading, navigation } = props;
  const feedback = useFeedback();
  const reportType = props.reportType;
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const batch = data?.batch ?? null;
  const output = useConsolidatedReport(batch?.id ?? null, batch?.status ?? null, batch?.revision ?? null);
  const workspace = useConsolidationDecisionWorkspace({
    data,
    capabilities: props.capabilities,
    onRefresh: props.onRefresh,
    onBatchDeleted: props.onBatchDeleted,
  });
  const statement = output.report?.statements.find((item) => item.reportType === reportType) ?? null;
  const workpaperLines = useMemo(() => statement ? consolidationWorkpaperLines(statement).filter((line) => {
    const adjustment = consolidationWorkpaperAdjustmentAmounts(line);
    return Math.abs(adjustment.debit) >= 0.005 || Math.abs(adjustment.credit) >= 0.005;
  }) : [], [statement]);
  const entries = batch?.entries ?? [];
  const canExport = props.capabilities.canExport;
  const parentName = data?.scope.parent?.name || "合并主体";

  const downloadWorkbook = useCallback(async () => {
    if (!canExport || !batch || !data) return;
    setDownloading(true);
    try {
      await downloadStatementWorkbook(
        workspacePath(`/api/modules/finance/statements/consolidation/batches/${batch.id}/report/export?artifact=workpaper`),
        `${parentName}-${data.scope.year}.${String(data.scope.month).padStart(2, "0")}-合并工作底稿.xlsx`,
      );
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "合并工作底稿下载失败");
    } finally {
      setDownloading(false);
    }
  }, [batch, canExport, data, feedback, parentName]);

  useEffect(() => {
    setExpandedKeys(new Set());
  }, [batch?.id, reportType]);

  const columns = useMemo<DataSurfaceColumnSpec<ConsolidatedOutputLine>[]>(() => [
    {
      key: "item",
      label: "项目",
      required: true,
      width: "xl",
      cell: (line) => ({
        kind: "stack",
        gap: "xs",
        items: [
          { kind: "disclosure", label: line.label, expanded: expandedKeys.has(line.lineCode), emphasis: line.isTotal || line.isGrandTotal ? "strong" : "medium" },
          ...(line.code ? [{ kind: "text" as const, value: line.code, tone: "muted" as const }] : []),
        ],
      }),
    },
    { key: "source", label: "个别报表合计", required: true, width: "md", cell: (line) => ({ kind: "amount", value: line.sourceAmount }) },
    { key: "elimination-debit", label: "抵销借方", required: true, width: "md", cell: (line) => ({ kind: "amount", value: consolidationWorkpaperAdjustmentAmounts(line).debit, showZero: false }) },
    { key: "elimination-credit", label: "抵销贷方", required: true, width: "md", cell: (line) => ({ kind: "amount", value: consolidationWorkpaperAdjustmentAmounts(line).credit, showZero: false }) },
    { key: "consolidated", label: "合并数", required: true, width: "md", cell: (line) => ({ kind: "amount", value: line.amount }) },
  ], [expandedKeys]);

  const toolbar = {
    items: [
      ...props.sharedToolbarItems,
      props.reportTypeToolbarItem,
      ...(canExport ? [{
        kind: "action-group" as const,
        key: "workpaper-actions",
        actions: [{
          key: "export",
          label: downloading ? "下载中" : "下载工作底稿",
          kind: "export" as const,
          disabled: downloading || !output.report,
          onClick: () => void downloadWorkbook(),
        }],
      }] : []),
    ],
  };

  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = [createStatusSection("consolidation-workpaper-overview-status", {
      kind: overviewLoading ? "loading" : "error",
      content: overviewLoading ? "正在读取合并批次" : overviewError || "合并批次加载失败",
    })];
  } else if (!batch) {
    sections = [createStatusSection("consolidation-workpaper-batch-required", {
      kind: "empty",
      content: "请先在“合并准备”创建并维护期间批次。",
    })];
  } else if (output.loading) {
    sections = [createStatusSection("consolidation-workpaper-loading", { kind: "loading", content: "正在重放合并工作底稿" })];
  } else if (!output.report || !statement) {
    sections = [createStatusSection("consolidation-workpaper-error", {
      kind: output.error ? "error" : "empty",
      content: output.error || "当前批次尚未形成可预览的合并工作底稿",
    })];
  } else {
    sections = [
      ...workspace.lifecycleSections(props.onWorkpaperConfirmed),
      createPageTableSection("consolidation-workpaper-table", {
        rows: workpaperLines,
        columns,
        visibleColumns: columns.map((column) => column.key),
        rowKey: (line) => line.lineCode,
        onRowClick: (line) => setExpandedKeys((current) => {
          const next = new Set(current);
          if (next.has(line.lineCode)) next.delete(line.lineCode);
          else next.add(line.lineCode);
          return next;
        }),
        expandedRowKeys: expandedKeys,
        expandedRow: (line) => expandedWorkpaperRow(entries, reportType, line),
        rowState: (line) => Math.abs(line.adjustmentAmount) >= 0.01 ? "warning" : "normal",
        presentation: { density: "compact", cellWrap: "nowrap" },
        scroll: { x: true },
        emptyText: "当前报表没有抵销借方或抵销贷方",
      }),
    ];
  }

  return <PageSurface kind="standard" tabbar={navigation} toolbar={toolbar} body={createPageBody(sections)} />;
}
