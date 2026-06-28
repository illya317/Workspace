"use client";

import { useMemo } from "react";
import {
  PageSurface,
  createPageActionsBlock,
  createPageDataBlock,
  createPageInlineFieldsBlock,
  type DataSurfaceColumnSpec,
  type FormSurfaceFieldSpec,
  type PageSurfaceBlockSpec,
  type PageSurfaceCommandSpec,
} from "@workspace/core/ui";
import type {
  WorkReportCollectionResponse,
  WorkReportCollectionSpace,
  WorkReportDraftResponse,
  WorkReportItem,
} from "./types";

type ReportDraftTableProps = {
  draft: WorkReportDraftResponse | null;
  loading: boolean;
  canEdit: boolean;
  onUpdate: (index: number, patch: Partial<WorkReportItem>) => void;
  onRemove: (index: number) => void;
};

type ReportCollectionTableProps = {
  collection: WorkReportCollectionResponse | null;
  loading: boolean;
};

type ReportDraftRow = WorkReportItem & {
  rowIndex: number;
};

function getDraftRows(draft: WorkReportDraftResponse | null): ReportDraftRow[] {
  return draft?.items.map((item, index) => ({
    ...item,
    rowIndex: index,
  })) || [];
}

function createDraftColumns({
  canEdit,
  onUpdate,
  onRemove,
}: Pick<ReportDraftTableProps, "canEdit" | "onUpdate" | "onRemove">): DataSurfaceColumnSpec<ReportDraftRow>[] {
  return [{
    key: "title",
    label: "事项",
    required: true,
    headerClassName: "w-[8rem]",
    cellClassName: "w-[8rem] min-w-[8rem] max-w-[8rem] whitespace-normal align-middle",
    cell: item => item.workItemId && item.source !== "stale" ? <div className="break-words text-sm font-medium text-slate-900">{item.title}</div> : <InlineFieldCell blockKey={`title-${item.rowIndex}`} field={{ key: `title-${item.rowIndex}`, label: "事项", spec: { valueType: "string", control: "text", state: !canEdit ? "readonly" : "normal" }, value: item.title, placeholder: "填写事项", onChange: value => onUpdate(item.rowIndex, {
      title: String(value ?? "")
    }) }} />
  }, {
    key: "done",
    label: "本周完成",
    required: true,
    headerClassName: "w-[16rem]",
    cellClassName: "w-[16rem] min-w-[16rem] max-w-[16rem] align-top",
    cell: item => <InlineFieldCell blockKey={`done-${item.rowIndex}`} field={{ key: `done-${item.rowIndex}`, label: "本周完成", spec: { valueType: "string", control: "text", multiline: true, state: !canEdit ? "readonly" : "normal" }, value: item.doneThisWeek, rows: 3, placeholder: item.previousPlanSnapshot ? `上周计划：${item.previousPlanSnapshot}` : "本周干了什么", onChange: value => onUpdate(item.rowIndex, {
      doneThisWeek: String(value ?? "")
    }) }} />
  }, {
    key: "next",
    label: "下周计划",
    required: true,
    headerClassName: "w-[16rem]",
    cellClassName: "w-[16rem] min-w-[16rem] max-w-[16rem] align-top",
    cell: item => <InlineFieldCell blockKey={`next-${item.rowIndex}`} field={{ key: `next-${item.rowIndex}`, label: "下周计划", spec: { valueType: "string", control: "text", multiline: true, state: !canEdit ? "readonly" : "normal" }, value: item.planNextWeek, rows: 3, placeholder: "下周准备做什么", onChange: value => onUpdate(item.rowIndex, {
      planNextWeek: String(value ?? "")
    }) }} />
  }, {
    key: "actions",
    label: "操作",
    required: true,
    headerClassName: "w-24",
    cellClassName: "w-24 align-middle",
    cell: item => canEdit && item.source !== "work" ? <InlineActionsCell blockKey={`remove-${item.rowIndex}`} actions={[{ key: `remove-${item.rowIndex}`, label: "移除", variant: "danger", onClick: () => onRemove(item.rowIndex) }]} /> : <span className="text-xs text-slate-400">锁定</span>
  }];
}

export function buildReportDraftTableBlock(props: ReportDraftTableProps): PageSurfaceBlockSpec {
  const rows = getDraftRows(props.draft);
  const columns = createDraftColumns(props);
  return createPageDataBlock("report-draft-table", {
      kind: "table",
      rows,
      columns,
      visibleColumns: [],
      density: "compact",
      loading: props.loading,
      emptyText: "暂无可汇报事项",
      rowKey: (item, index) => item.id || item.workItemId || `new-${index}`,
      scrollClassName: "overflow-y-hidden rounded-lg border border-slate-200 bg-white",
    });
}

export function ReportDraftTable(props: ReportDraftTableProps) {
  const rows = useMemo(() => getDraftRows(props.draft), [props.draft]);
  const columns = useMemo(() => createDraftColumns(props), [props]);
  return <PageSurface embedded kind="list" blocks={[createPageDataBlock("report-draft-table", { kind: "table", rows, columns, visibleColumns: [], density: "compact", loading: props.loading, emptyText: "暂无可汇报事项", rowKey: (item, index) => item.id || item.workItemId || `new-${index}`, scrollClassName: "overflow-y-hidden rounded-lg border border-slate-200 bg-white" })]} />;
}

function createCollectionColumns(): DataSurfaceColumnSpec<WorkReportCollectionSpace>[] {
  return [{
    key: "space",
    label: "工作空间",
    required: true,
    headerClassName: "w-64",
    cellClassName: "w-64 whitespace-normal",
    cell: space => <div>
          <div className="text-sm font-semibold text-slate-900">{space.name}</div>
          {space.subtitle && <div className="mt-1 text-xs text-slate-400">{space.subtitle}</div>}
        </div>
  }, {
    key: "status",
    label: "状态",
    required: true,
    headerClassName: "w-28",
    cellClassName: "w-28",
    cell: space => <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${space.status === "submitted" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{space.status === "submitted" ? "已提交" : "未提交"}</span>
  }, {
    key: "reports",
    label: "汇报",
    required: true,
    cellClassName: "min-w-[34rem] whitespace-normal",
    cell: space => space.reports.length ? <ReportStack space={space} /> : <span className="text-sm text-slate-400">暂无提交</span>
  }];
}

export function buildReportCollectionTableBlock({ collection, loading }: ReportCollectionTableProps): PageSurfaceBlockSpec {
  const rows = collection?.spaces || [];
  if (!loading && rows.length === 0) {
    return createPageDataBlock("report-collection-empty", { kind: "records", records: [], empty: "暂无可汇总的工作空间" });
  }
  const columns = createCollectionColumns();
  return createPageDataBlock("report-collection-table", {
      kind: "table",
      rows,
      columns,
      visibleColumns: [],
      density: "compact",
      loading,
      emptyText: "暂无汇报",
      rowKey: space => `${space.targetType}:${space.targetId}`,
      scrollClassName: "overflow-y-hidden rounded-lg border border-slate-200 bg-white",
    });
}

export function ReportCollectionTable({ collection, loading }: ReportCollectionTableProps) {
  const rows = collection?.spaces || [];
  const columns = useMemo(() => createCollectionColumns(), []);
  const block = !loading && rows.length === 0
    ? createPageDataBlock("report-collection-empty", { kind: "records", records: [], empty: "暂无可汇总的工作空间" })
    : createPageDataBlock("report-collection-table", { kind: "table", rows, columns, visibleColumns: [], density: "compact", loading, emptyText: "暂无汇报", rowKey: space => `${space.targetType}:${space.targetId}`, scrollClassName: "overflow-y-hidden rounded-lg border border-slate-200 bg-white" });
  return <PageSurface embedded kind="list" blocks={[block]} />;
}

function ReportStack({
  space
}: {
  space: WorkReportCollectionSpace;
}) {
  return <PageSurface embedded kind="list" blocks={[createPageDataBlock("report-stack", {
    kind: "records",
    records: space.reports.map(report => ({
      key: String(report.id),
      expanded: true,
      onToggle: () => {},
      header: <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">{report.submitterName}</span>
        <span>{formatDateTime(report.submittedAt)}</span>
        <span>{report.items.length} 项</span>
      </div>,
      detail: <div className="space-y-2">
            {report.items.map(item => <div key={item.id || `${report.id}-${item.title}`} className="grid gap-2 text-xs leading-5 text-slate-600 lg:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="font-medium text-slate-800">{item.title}</div>
                <div><span className="text-slate-400">本周：</span>{item.doneThisWeek || "无"}</div>
                <div><span className="text-slate-400">下周：</span>{item.planNextWeek || "无"}</div>
              </div>)}
          </div>,
    })),
  })]} />;
}

function InlineFieldCell({
  blockKey,
  field,
}: {
  blockKey: string;
  field: FormSurfaceFieldSpec;
}) {
  return <PageSurface embedded kind="detail" blocks={[createPageInlineFieldsBlock(blockKey, [field])]} />;
}

function InlineActionsCell({
  blockKey,
  actions,
}: {
  blockKey: string;
  actions: PageSurfaceCommandSpec[];
}) {
  return <PageSurface embedded kind="detail" blocks={[createPageActionsBlock(blockKey, actions)]} />;
}

function formatDateTime(value: string | null) {
  if (!value) return "未提交";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
