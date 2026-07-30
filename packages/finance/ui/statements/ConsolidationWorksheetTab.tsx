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
import type { ConsolidatedOutputLine } from "@workspace/finance/types";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  consolidationWorkpaperAdjustmentAmounts,
  consolidationWorkpaperEntities,
  consolidationWorkpaperEntryEffects,
  consolidationWorkpaperEntityAmount,
  consolidationWorkpaperLines,
  type ConsolidationWorkpaperEntryEffect,
  consolidationWorkpaperOpenItems,
  type ConsolidationWorkpaperOpenItem,
} from "./consolidation-workpaper-model";
import type { ConsolidationTabProps } from "./statement-ui-types";
import { useConsolidatedReport } from "./useConsolidatedReport";
import { downloadStatementWorkbook } from "./statement-download";
import { useConsolidationDecisionWorkspace } from "./useConsolidationDecisionWorkspace";

const ENTRY_EFFECT_COLUMNS: DataSurfaceColumnSpec<ConsolidationWorkpaperEntryEffect>[] = [
  { key: "entry", label: "合并凭证", required: true, width: "xl", cell: (row) => `${row.entryNo} · ${row.title}` },
  { key: "type", label: "类别", width: "md", cell: (row) => row.typeLabel },
  { key: "company", label: "涉及主体", width: "md", cell: (row) => row.companies },
  { key: "effect", label: "对本项目影响", required: true, width: "md", cell: (row) => ({ kind: "amount", value: row.amount }) },
  { key: "note", label: "说明", width: "lg", cell: (row) => row.note || "—" },
];

const OPEN_ITEM_COLUMNS: DataSurfaceColumnSpec<ConsolidationWorkpaperOpenItem>[] = [
  { key: "category", label: "类别", required: true, width: "md", cell: (row) => row.categoryLabel },
  { key: "title", label: "未合并事项", required: true, width: "xl", cell: (row) => row.title },
  { key: "parties", label: "涉及主体", width: "lg", cell: (row) => row.parties },
  { key: "amounts", label: "账面金额", width: "xl", cell: (row) => row.bookAmounts },
  { key: "difference", label: "差额", width: "md", align: "right", cell: (row) => `${row.difference.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${row.currencyCode ? ` ${row.currencyCode}` : ""}` },
  { key: "status", label: "状态", required: true, width: "md", cell: (row) => row.statusLabel },
  { key: "action", label: "下一步", width: "lg", cell: (row) => row.actionLabel },
];

function expandedWorkpaperRow(
  effects: readonly ConsolidationWorkpaperEntryEffect[],
): DataSurfaceCellSpec {
  return {
    kind: "group",
    direction: "column",
    items: [
      { kind: "text", value: "按合并凭证汇总展示本项目的处理结果；原始分录及审计来源请在“合并明细”查看。", tone: "muted", wrap: "wrap" },
      { kind: "data", data: {
        kind: "table",
        rows: [...effects],
        columns: ENTRY_EFFECT_COLUMNS,
        visibleColumns: ENTRY_EFFECT_COLUMNS.map((column) => column.key),
        rowKey: (row) => row.key,
        presentation: { density: "compact", cellWrap: "wrap", header: "plain" },
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
  const workpaperLines = useMemo(() => statement ? consolidationWorkpaperLines(statement) : [], [statement]);
  const entities = useMemo(() => consolidationWorkpaperEntities(output.report, batch?.entities), [batch?.entities, output.report]);
  const entries = useMemo(() => batch?.entries ?? [], [batch?.entries]);
  const effectsByLine = useMemo(() => new Map(workpaperLines.map((line) => [
    line.lineCode,
    consolidationWorkpaperEntryEffects(entries, reportType, line),
  ])), [entries, reportType, workpaperLines]);
  const openItems = useMemo(() => consolidationWorkpaperOpenItems(
    data?.adjustmentComparisons ?? [],
    entries,
  ), [data?.adjustmentComparisons, entries]);
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
          ...(effectsByLine.get(line.lineCode)?.length ? [{
            kind: "disclosure" as const,
            label: line.label,
            expanded: expandedKeys.has(line.lineCode),
            emphasis: line.isTotal || line.isGrandTotal ? "strong" as const : "medium" as const,
          }] : [{
            kind: "text" as const,
            value: line.label,
            emphasis: line.isTotal || line.isGrandTotal ? "strong" as const : "medium" as const,
          }]),
          ...(line.code ? [{ kind: "text" as const, value: line.code, tone: "muted" as const }] : []),
        ],
      }),
    },
    ...entities.map((entity): DataSurfaceColumnSpec<ConsolidatedOutputLine> => ({
      key: `entity-${entity.entitySnapshotId}`,
      label: `${entity.companyCode} · ${entity.companyName}`,
      required: true,
      width: "md",
      cell: (line) => ({
        kind: "amount",
        value: consolidationWorkpaperEntityAmount(line, entity.entitySnapshotId),
      }),
    })),
    { key: "source", label: "个别报表合计", required: true, width: "md", cell: (line) => ({ kind: "amount", value: line.sourceAmount }) },
    { key: "handling", label: "处理", required: true, width: "md", cell: (line) => workpaperHandlingLabel(line, effectsByLine.get(line.lineCode) ?? []) },
    { key: "elimination-debit", label: "抵销/调整借方", required: true, width: "md", cell: (line) => ({ kind: "amount", value: consolidationWorkpaperAdjustmentAmounts(line).debit, showZero: false }) },
    { key: "elimination-credit", label: "抵销/调整贷方", required: true, width: "md", cell: (line) => ({ kind: "amount", value: consolidationWorkpaperAdjustmentAmounts(line).credit, showZero: false }) },
    { key: "consolidated", label: "合并数", required: true, width: "md", cell: (line) => ({ kind: "amount", value: line.amount }) },
  ], [effectsByLine, entities, expandedKeys]);

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
      {
        ...createPageTableSection("consolidation-workpaper-table", {
          rows: workpaperLines,
          columns,
          visibleColumns: columns.map((column) => column.key),
          rowKey: (line) => line.lineCode,
          onRowClick: (line) => setExpandedKeys((current) => {
            if (!(effectsByLine.get(line.lineCode)?.length)) return current;
            const next = new Set(current);
            if (next.has(line.lineCode)) next.delete(line.lineCode);
            else next.add(line.lineCode);
            return next;
          }),
          expandedRowKeys: expandedKeys,
          expandedRow: (line) => expandedWorkpaperRow(effectsByLine.get(line.lineCode) ?? []),
          rowState: (line) => line.isTotal || line.isGrandTotal
            ? "total"
            : Math.abs(line.adjustmentAmount) >= 0.01 ? "info" : "normal",
          presentation: { density: "compact", cellWrap: "nowrap" },
          scroll: { x: true },
          emptyText: "当前报表暂无项目",
        }),
        header: { title: "合并桥表" },
      },
      {
        ...createPageTableSection("consolidation-workpaper-open-items", {
          rows: openItems,
          columns: OPEN_ITEM_COLUMNS,
          visibleColumns: OPEN_ITEM_COLUMNS.map((column) => column.key),
          rowKey: (row) => row.key,
          rowState: () => "warning",
          presentation: { density: "compact", cellWrap: "nowrap" },
          scroll: { x: true },
          emptyText: "本期没有未合并事项",
        }),
        header: { title: `未合并事项（${openItems.length}）` },
      },
    ];
  }

  return <PageSurface kind="standard" tabbar={navigation} toolbar={toolbar} body={createPageBody(sections)} />;
}

function workpaperHandlingLabel(
  line: ConsolidatedOutputLine,
  effects: readonly ConsolidationWorkpaperEntryEffect[],
) {
  if (effects.length > 0) {
    return `${[...new Set(effects.map((effect) => effect.typeLabel))].join("、")} · ${effects.length}笔`;
  }
  return Math.abs(line.adjustmentAmount) >= 0.005 ? "合计派生" : "—";
}
