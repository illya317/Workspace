"use client";

import { useMemo } from "react";
import { createActionsSection, createInlineFieldsSection, createPageBody, createPageDataSection, createRecordSection, type DataSurfaceColumnSpec, type FormSurfaceFieldSpec, PageSurface, type BodySurfaceSectionSpec, type BodySurfaceCommandSpec } from "@workspace/core/ui";
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

    wrap: "wrap", width: "wide",
    cell: item => item.workItemId && item.source !== "stale" ? <div className="break-words text-sm font-medium text-slate-900">{item.title}</div> : <InlineFieldCell blockKey={`title-${item.rowIndex}`} field={{ key: `title-${item.rowIndex}`, label: "事项", spec: { valueType: "string", control: "text", state: !canEdit ? "readonly" : "normal" }, value: item.title, placeholder: "填写事项", onChange: value => onUpdate(item.rowIndex, {
      title: String(value ?? "")
    }) }} />
  }, {
    key: "done",
    label: "本周完成",
    required: true,

    width: "wide",
    cell: item => <InlineFieldCell blockKey={`done-${item.rowIndex}`} field={{ key: `done-${item.rowIndex}`, label: "本周完成", spec: { valueType: "string", control: "text", multiline: true, state: !canEdit ? "readonly" : "normal" }, value: item.doneThisWeek, rows: 3, placeholder: item.previousPlanSnapshot ? `上周计划：${item.previousPlanSnapshot}` : "本周干了什么", onChange: value => onUpdate(item.rowIndex, {
      doneThisWeek: String(value ?? "")
    }) }} />
  }, {
    key: "next",
    label: "下周计划",
    required: true,

    width: "wide",
    cell: item => <InlineFieldCell blockKey={`next-${item.rowIndex}`} field={{ key: `next-${item.rowIndex}`, label: "下周计划", spec: { valueType: "string", control: "text", multiline: true, state: !canEdit ? "readonly" : "normal" }, value: item.planNextWeek, rows: 3, placeholder: "下周准备做什么", onChange: value => onUpdate(item.rowIndex, {
      planNextWeek: String(value ?? "")
    }) }} />
  }, {
    key: "actions",
    label: "操作",
    required: true,
    width: "xs",

    cell: item => canEdit && item.source !== "work" ? <InlineActionsCell blockKey={`remove-${item.rowIndex}`} actions={[{ key: `remove-${item.rowIndex}`, label: "移除", variant: "danger", onClick: () => onRemove(item.rowIndex) }]} /> : <span className="text-xs text-slate-400">锁定</span>
  }];
}

export function buildReportDraftTableBlock(props: ReportDraftTableProps): BodySurfaceSectionSpec {
  const rows = getDraftRows(props.draft);
  const columns = createDraftColumns(props);
  return createPageDataSection("report-draft-table", {
      kind: "table",
      rows,
      columns,
      visibleColumns: [],
            presentation: { density: "compact" },

      loading: props.loading,
      emptyText: "暂无可汇报事项",
      rowKey: (item, index) => item.id || item.workItemId || `new-${index}`,
      scroll: { y: "hidden" },
    });
}

export function ReportDraftTable(props: ReportDraftTableProps) {
  const rows = useMemo(() => getDraftRows(props.draft), [props.draft]);
  const columns = useMemo(() => createDraftColumns(props), [props]);
  return <PageSurface kind="standard" embedded body={createPageBody([createPageDataSection("report-draft-table", { kind: "table", rows, columns, visibleColumns: [],   presentation: { density: "compact" },
 loading: props.loading, emptyText: "暂无可汇报事项", rowKey: (item, index) => item.id || item.workItemId || `new-${index}`, scroll: { y: "hidden" }, })])} />;
}

function createCollectionColumns(): DataSurfaceColumnSpec<WorkReportCollectionSpace>[] {
  return [{
    key: "space",
    label: "工作空间",
    required: true,
    width: "lg",
    wrap: "wrap",
    cell: space => <div>
          <div className="text-sm font-semibold text-slate-900">{space.name}</div>
          {space.subtitle && <div className="mt-1 text-xs text-slate-400">{space.subtitle}</div>}
        </div>
  }, {
    key: "status",
    label: "状态",
    required: true,
    width: "sm",

    cell: space => <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${space.status === "submitted" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{space.status === "submitted" ? "已提交" : "未提交"}</span>
  }, {
    key: "reports",
    label: "汇报",
    required: true,
    wrap: "wrap", width: "wide",
    cell: space => space.reports.length ? <ReportStack space={space} /> : <span className="text-sm text-slate-400">暂无提交</span>
  }];
}

export function buildReportCollectionTableBlock({ collection, loading }: ReportCollectionTableProps): BodySurfaceSectionSpec {
  const rows = collection?.spaces || [];
  if (!loading && rows.length === 0) {
    return createRecordSection("report-collection-empty", { records: [], empty: "暂无可汇总的工作空间" });
  }
  const columns = createCollectionColumns();
  return createPageDataSection("report-collection-table", {
      kind: "table",
      rows,
      columns,
      visibleColumns: [],
            presentation: { density: "compact" },

      loading,
      emptyText: "暂无汇报",
      rowKey: space => `${space.targetType}:${space.targetId}`,
      scroll: { y: "hidden" },
    });
}

export function ReportCollectionTable({ collection, loading }: ReportCollectionTableProps) {
  const rows = collection?.spaces || [];
  const columns = useMemo(() => createCollectionColumns(), []);
  const block = !loading && rows.length === 0
    ? createRecordSection("report-collection-empty", { records: [], empty: "暂无可汇总的工作空间" })
    : createPageDataSection("report-collection-table", { kind: "table", rows, columns, visibleColumns: [],     presentation: { density: "compact" },
 loading, emptyText: "暂无汇报", rowKey: space => `${space.targetType}:${space.targetId}`, scroll: { y: "hidden" }, });
  return <PageSurface kind="standard" embedded body={createPageBody([block])} />;
}

function ReportStack({
  space
}: {
  space: WorkReportCollectionSpace;
}) {
  return <PageSurface kind="standard" embedded body={createPageBody([createRecordSection("report-stack", {
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
  })])} />;
}

function InlineFieldCell({
  blockKey,
  field,
}: {
  blockKey: string;
  field: FormSurfaceFieldSpec;
}) {
  return <PageSurface kind="standard" embedded body={createPageBody([createInlineFieldsSection(blockKey, [field])])} />;
}

function InlineActionsCell({
  blockKey,
  actions,
}: {
  blockKey: string;
  actions: BodySurfaceCommandSpec[];
}) {
  return <PageSurface kind="standard" embedded body={createPageBody([createActionsSection(blockKey, actions)])} />;
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
