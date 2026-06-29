"use client";

import { useMemo } from "react";
import { createPageBody, createPageDataSection, createRecordSection, createStatusSection, type DataSurfaceColumnSpec, PageSurface, type BodySurfaceSectionSpec } from "@workspace/core/ui";
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
}: Pick<ReportDraftTableProps, "canEdit" | "onUpdate">): DataSurfaceColumnSpec<ReportDraftRow>[] {
  return [{
    key: "title",
    label: "事项",
    required: true,
    wrap: "wrap", width: "md",
    cell: item => {
      const readonly = item.workItemId && item.source !== "stale";
      return {
        kind: "input",
        spec: { valueType: "string", control: "text", multiline: true, state: readonly || !canEdit ? "readonly" : "normal" },
        value: item.title,
        rows: 2,
        resize: "none",
        placeholder: "填写事项",
        ariaLabel: "事项",
        density: "compact",
        onChange: readonly ? undefined : value => onUpdate(item.rowIndex, {
          title: String(value ?? "")
        }),
      };
    }
  }, {
    key: "done",
    label: "本周完成",
    required: true,
    wrap: "wrap", width: "xl",
    cell: item => ({
      kind: "input",
      spec: { valueType: "string", control: "text", multiline: true, state: !canEdit ? "readonly" : "normal" },
      value: item.doneThisWeek,
      rows: 2,
      resize: "none",
      placeholder: item.previousPlanSnapshot ? `上周计划：${item.previousPlanSnapshot}` : "本周干了什么",
      ariaLabel: "本周完成",
      density: "compact",
      onChange: value => onUpdate(item.rowIndex, {
        doneThisWeek: String(value ?? "")
      }),
    })
  }, {
    key: "next",
    label: "下周计划",
    required: true,
    wrap: "wrap", width: "xl",
    cell: item => ({
      kind: "input",
      spec: { valueType: "string", control: "text", multiline: true, state: !canEdit ? "readonly" : "normal" },
      value: item.planNextWeek,
      rows: 2,
      resize: "none",
      placeholder: "下周准备做什么",
      ariaLabel: "下周计划",
      density: "compact",
      onChange: value => onUpdate(item.rowIndex, {
        planNextWeek: String(value ?? "")
      }),
    })
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
      rowActions: (item) => props.canEdit && item.source !== "work" ? [{
        key: `remove-${item.rowIndex}`,
        kind: "delete",
        label: "移除",
        onClick: () => props.onRemove(item.rowIndex),
      }] : [],
      actionsColumn: { label: "操作", align: "center" },
      scroll: { x: false, y: "hidden" },
    });
}

export function ReportDraftTable(props: ReportDraftTableProps) {
  const rows = useMemo(() => getDraftRows(props.draft), [props.draft]);
  const columns = useMemo(() => createDraftColumns(props), [props]);
  return <PageSurface kind="standard" embedded body={createPageBody([createPageDataSection("report-draft-table", { kind: "table", rows, columns, visibleColumns: [],   presentation: { density: "compact" },
 loading: props.loading, emptyText: "暂无可汇报事项", rowKey: (item, index) => item.id || item.workItemId || `new-${index}`, rowActions: (item) => props.canEdit && item.source !== "work" ? [{ key: `remove-${item.rowIndex}`, kind: "delete", label: "移除", onClick: () => props.onRemove(item.rowIndex) }] : [], actionsColumn: { label: "操作", align: "center" }, scroll: { x: false, y: "hidden" }, })])} />;
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
    return createStatusSection("report-collection-empty", { kind: "empty", content: "暂无可汇总的工作空间" });
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
      scroll: { x: false, y: "hidden" },
    });
}

export function ReportCollectionTable({ collection, loading }: ReportCollectionTableProps) {
  const rows = collection?.spaces || [];
  const columns = useMemo(() => createCollectionColumns(), []);
  const block = !loading && rows.length === 0
    ? createStatusSection("report-collection-empty", { kind: "empty", content: "暂无可汇总的工作空间" })
    : createPageDataSection("report-collection-table", { kind: "table", rows, columns, visibleColumns: [],     presentation: { density: "compact" },
 loading, emptyText: "暂无汇报", rowKey: space => `${space.targetType}:${space.targetId}`, scroll: { x: false, y: "hidden" }, });
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
