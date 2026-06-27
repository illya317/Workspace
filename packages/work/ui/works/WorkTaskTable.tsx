"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DataSurface,
  type DataSurfaceColumnSpec,
  type DataTableRowEditActionConfig,
  type PageSurfaceBlockSpec,
} from "@workspace/core/ui";
import { createWorkDraft, getStatusLabel, getWorkItemTypeLabel, getWorkPeriodLabel, getWorkSourceTypeLabel } from "./model";
import { WorkTaskDetail } from "./WorkTaskDetail";
import { WorkTaskForm } from "./WorkTaskFields";
import type { WorkItem, WorkItemDraft, WorkItemType, WorkSourceType } from "./types";

type TreeRow = WorkItem & {
  depth: number;
  childCount: number;
};

type WorkTaskTableProps = {
  works: WorkItem[];
  loading: boolean;
  canEdit: boolean;
  saving: boolean;
  detailId: number | null;
  editingId: number | null;
  editDraft: WorkItemDraft | null;
  statusFilter: "active" | "done" | "archived";
  periodFilter: string;
  itemTypeFilter: "all" | WorkItemType;
  sourceFilter: "all" | WorkSourceType;
  targetType?: WorkItem["targetType"];
  onDetail: (work: WorkItem) => void;
  onEdit: (work: WorkItem) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onEditDraftChange: (draft: WorkItemDraft) => void;
  onDelete: (work: WorkItem) => void;
};

type WorkTaskTableBlock = Extract<PageSurfaceBlockSpec, { kind: "data" }>;

export function useWorkTaskTableBlock({
  works,
  loading,
  canEdit,
  saving,
  detailId,
  editingId,
  editDraft,
  statusFilter,
  periodFilter,
  itemTypeFilter,
  sourceFilter,
  targetType,
  onDetail,
  onEdit,
  onSave,
  onCancelEdit,
  onEditDraftChange,
  onDelete,
}: WorkTaskTableProps): WorkTaskTableBlock {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const showOwner = targetType !== "personal";
  const tree = useMemo(
    () => buildTreeRows(works, { statusFilter, periodFilter, itemTypeFilter, sourceFilter, expandedIds }),
    [expandedIds, itemTypeFilter, periodFilter, sourceFilter, statusFilter, works],
  );

  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set(current);
      for (const work of works) {
        if (works.some((item) => item.parentWorkItemId === work.id)) next.add(work.id);
      }
      return next;
    });
  }, [works]);

  const columns = createColumns({
    showOwner,
    expandedIds,
    onToggleExpand: (work) => {
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(work.id)) next.delete(work.id);
        else next.add(work.id);
        return next;
      });
    },
  });

  if (!loading && tree.rows.length === 0) {
    return {
      kind: "data",
      key: "task-table",
      surface: { kind: "records", records: [], empty: "暂无工作项。可以从上方新增目标、结果或任务。" },
    };
  }

  return {
    kind: "data",
    key: "task-table",
    surface: {
      kind: "table",
      rows: tree.rows,
      columns,
      visibleColumns: ["owner", "kr", "period", "status", "priority", "source"].filter((key) => key !== "owner" || showOwner),
      density: "compact",
      loading,
      emptyText: "暂无工作项",
      rowKey: (work) => work.id,
      rowClassName: (work) => work.itemType === "objective" ? "bg-slate-50/60" : "",
      onRowClick: onDetail,
      expandedRowKey: detailId,
      renderExpandedRow: (work) => editDraft && editingId === work.id ? (
        <WorkTaskForm
          draft={editDraft}
          works={works}
          disabled={saving}
          excludedWorkId={work.id}
          targetType={targetType}
          onChange={onEditDraftChange}
        />
      ) : <WorkTaskDetail work={work} />,
      rowEditActions: (work): DataTableRowEditActionConfig<TreeRow> => ({
        editing: editingId === work.id,
        canEdit,
        canSave: Boolean(editDraft?.content.trim()),
        initial: createWorkDraft(work),
        current: editDraft,
        saving,
        editLabel: "编辑工作项",
        saveLabel: "保存工作项",
        cancelLabel: "取消编辑",
        onEdit,
        onSave,
        onCancel: onCancelEdit,
      }),
      rowActions: (work) => {
        if (!canEdit || editingId === work.id) return [];
        return [
          {
            key: "delete",
            kind: "delete",
            label: "删除工作项",
            onClick: () => onDelete(work),
            disabled: saving,
          },
        ];
      },
      scrollClassName: "overflow-y-hidden rounded-lg border border-slate-200",
    },
  };
}

export default function WorkTaskTable(props: WorkTaskTableProps) {
  const block = useWorkTaskTableBlock(props);
  return <DataSurface {...block.surface} />;
}

function createColumns({
  showOwner,
  expandedIds,
  onToggleExpand,
}: {
  showOwner: boolean;
  expandedIds: Set<number>;
  onToggleExpand: (work: TreeRow) => void;
}): DataSurfaceColumnSpec<TreeRow>[] {
  return [
    {
      key: "content",
      label: "工作大纲",
      required: true,
      headerClassName: "min-w-80",
      cellClassName: "min-w-80 max-w-[32rem]",
      cell: (work) => (
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: work.depth * 18 }}>
          {work.childCount > 0 ? (
            <button
              type="button"
              title={expandedIds.has(work.id) ? "收起" : "展开"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpand(work);
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-xs font-semibold text-slate-500 hover:bg-slate-50"
            >
              {expandedIds.has(work.id) ? "-" : "+"}
            </button>
          ) : (
            <span className="h-6 w-6 shrink-0" />
          )}
          <TypeBadge itemType={work.itemType} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-900" title={work.content}>{work.content}</div>
            {work.parentWorkItemContent && <div className="truncate text-xs text-slate-400" title={work.parentWorkItemContent}>上级：{work.parentWorkItemContent}</div>}
          </div>
        </div>
      ),
    },
    {
      key: "owner",
      label: "负责人",
      defaultVisible: showOwner,
      headerClassName: "w-28",
      cellClassName: "w-28",
      cell: (work) => work.ownerEmployeeName || "未设置",
    },
    {
      key: "kr",
      label: "结果",
      defaultVisible: true,
      headerClassName: "w-44",
      cellClassName: "w-44",
      cell: (work) => work.itemType === "key_result"
        ? <span className="text-sm text-slate-700">{krRange(work)}</span>
        : <span className="text-sm text-slate-300">-</span>,
    },
    {
      key: "period",
      label: "周期",
      defaultVisible: true,
      headerClassName: "w-44",
      cellClassName: "w-44",
      cell: (work) => <span className="text-sm text-slate-600">{getWorkPeriodLabel(work)}</span>,
    },
    {
      key: "status",
      label: "状态",
      defaultVisible: true,
      headerClassName: "w-24",
      cellClassName: "w-24",
      cell: (work) => {
        const status = work.itemType === "task" ? (work.isArchived ? "archived" : work.status) : null;
        if (!status) return <span className="text-sm text-slate-300">-</span>;
        return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusClassName(status)}`}>{getStatusLabel(status)}</span>;
      },
    },
    {
      key: "priority",
      label: "优先级",
      defaultVisible: true,
      headerClassName: "w-36",
      cellClassName: "w-36",
      cell: (work) => work.itemType === "task" ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500">
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">重要 {work.importance}</span>
          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-600">紧急 {work.urgency}</span>
        </div>
      ) : <span className="text-sm text-slate-300">-</span>,
    },
    {
      key: "source",
      label: "来源",
      defaultVisible: true,
      headerClassName: "min-w-48",
      cellClassName: "min-w-48 max-w-72",
      cell: (work) => <SourceCell work={work} />,
    },

  ];
}

function buildTreeRows(
  works: WorkItem[],
  filters: {
    statusFilter: "active" | "done" | "archived";
    periodFilter: string;
    itemTypeFilter: "all" | WorkItemType;
    sourceFilter: "all" | WorkSourceType;
    expandedIds: Set<number>;
  },
) {
  const byId = new Map(works.map((work) => [work.id, work]));
  const children = new Map<number, WorkItem[]>();
  const roots: WorkItem[] = [];
  for (const work of works) {
    if (work.parentWorkItemId && byId.has(work.parentWorkItemId)) {
      children.set(work.parentWorkItemId, [...(children.get(work.parentWorkItemId) || []), work]);
    } else {
      roots.push(work);
    }
  }
  for (const rows of children.values()) rows.sort(sortWorks);
  roots.sort(sortWorks);

  const included = new Set<number>();
  function includeIfMatched(work: WorkItem): boolean {
    const descendantMatched = (children.get(work.id) || []).some(includeIfMatched);
    const matched = matchesFilters(work, filters);
    if (matched || descendantMatched) included.add(work.id);
    return included.has(work.id);
  }
  roots.forEach(includeIfMatched);

  const rows: TreeRow[] = [];
  function append(work: WorkItem, depth: number) {
    if (!included.has(work.id)) return;
    const includedChildren = (children.get(work.id) || []).filter((child) => included.has(child.id));
    rows.push({ ...work, depth, childCount: includedChildren.length });
    if (!filters.expandedIds.has(work.id)) return;
    for (const child of includedChildren) append(child, depth + 1);
  }
  roots.forEach((root) => append(root, 0));
  return { rows };
}

function matchesFilters(
  work: WorkItem,
  filters: {
    statusFilter: "active" | "done" | "archived";
    periodFilter: string;
    itemTypeFilter: "all" | WorkItemType;
    sourceFilter: "all" | WorkSourceType;
  },
) {
  return matchesStatusFilter(work, filters.statusFilter)
    && matchesPeriodFilter(work, filters.periodFilter)
    && (filters.itemTypeFilter === "all" || work.itemType === filters.itemTypeFilter)
    && (filters.sourceFilter === "all" || work.sourceType === filters.sourceFilter);
}

function TypeBadge({ itemType }: { itemType: WorkItemType }) {
  const label = itemType === "objective" ? "目标" : itemType === "key_result" ? "结果" : "任务";
  const className = itemType === "objective"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : itemType === "key_result"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold ${className}`} title={getWorkItemTypeLabel(itemType)}>{label}</span>;
}

function SourceCell({ work }: { work: WorkItem }) {
  const detail = work.sourceType === "project"
    ? [work.linkedProjectName, work.linkedProjectPhaseName, work.linkedProjectTaskName].filter(Boolean).join(" / ")
    : work.sourceType === "meeting"
      ? [work.sourceMeetingTitle, work.sourceMeetingDecisionTitle, work.sourceMeetingActionCandidateTitle].filter(Boolean).join(" / ")
      : "";
  return (
    <div className="min-w-0">
      <div className="text-sm text-slate-700">{getWorkSourceTypeLabel(work.sourceType)}</div>
      {detail && <div className="truncate text-xs text-slate-400" title={detail}>{detail}</div>}
    </div>
  );
}

function sortWorks(a: WorkItem, b: WorkItem) {
  return (a.sortOrder - b.sortOrder) || (a.id - b.id);
}

function matchesStatusFilter(work: WorkItem, filter: "active" | "done" | "archived") {
  const archived = work.isArchived || work.status === "archived";
  if (filter === "archived") return archived;
  if (filter === "done") return !archived && work.itemType === "task" && work.status === "done";
  return !archived && (work.itemType !== "task" || work.status !== "done");
}

function matchesPeriodFilter(work: WorkItem, filter: string) {
  if (filter === "all") return true;
  if (filter === "long-term") return !work.periodType;
  return work.periodType === filter;
}

function statusClassName(status: string) {
  if (status === "done") return "bg-sky-50 text-sky-700";
  if (status === "archived") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}
function krRange(work: WorkItem) {
  const unit = work.krUnit || "";
  const value = (number: number | null) => number === null ? "未填" : `${number}${unit}`;
  return `${value(work.krStartValue)} / ${value(work.krCurrentValue)} / ${value(work.krTargetValue)}`;
}
