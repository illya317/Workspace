"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionGlyph, createPageBody, createStatusSection, type DataSurfaceColumnSpec, PageSurface, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { getStatusLabel, getWorkItemTypeLabel, isWorkDraftDirty } from "./model";
import { WorkTaskDetail } from "./WorkTaskDetail";
import { WorkTaskForm } from "./WorkTaskFields";
import type { WorkItem, WorkItemDraft, WorkItemType } from "./types";

type TreeRow = WorkItem & {
  depth: number;
  childCount: number;
};

type WorkTaskTableProps = {
  works: WorkItem[];
  loading: boolean;
  canEdit: boolean;
  canDelete: boolean;
  saving: boolean;
  detailId: number | null;
  editingId: number | null;
  editDraft: WorkItemDraft | null;
  statusFilter: "active" | "done" | "archived";
  itemTypeFilter: "all" | WorkItemType;
  onDetail: (work: WorkItem) => void;
  onEdit: (work: WorkItem) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onEditDraftChange: (draft: WorkItemDraft) => void;
  onDelete: (work: WorkItem) => void;
};

type WorkTaskTableSection = BodySurfaceSectionSpec;

export function useWorkTaskTableSection({
  works,
  loading,
  canEdit,
  canDelete,
  saving,
  detailId,
  editingId,
  editDraft,
  statusFilter,
  itemTypeFilter,
  onDetail,
  onEdit,
  onSave,
  onCancelEdit,
  onEditDraftChange,
  onDelete,
}: WorkTaskTableProps): WorkTaskTableSection {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const tree = useMemo(
    () => buildTreeRows(works, { statusFilter, itemTypeFilter, expandedIds }),
    [expandedIds, itemTypeFilter, statusFilter, works],
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
    return createStatusSection("task-table", { kind: "empty", content: "暂无节点。可以从上方新增目标、关键结果或子任务。" });
  }

  return {
    key: "task-table",
    body: { kind: "data", data: {
      kind: "table",
      rows: tree.rows,
      columns,
      visibleColumns: ["status", "priority"],
      presentation: { density: "compact" },

      loading,
      emptyText: "暂无节点",
      rowKey: (work) => work.id,
      rowState: (work) => work.itemType === "objective" ? "muted" : "normal",
      onRowClick: (work) => {
        if (!canEdit) {
          onDetail(work);
          return;
        }
        if (editingId === work.id) {
          onCancelEdit();
          return;
        }
        onEdit(work);
      },
      expandedRowKey: editingId ?? (canEdit ? null : detailId),
      expandedRowContent: (work) => editDraft && editingId === work.id ? (
        <WorkTaskForm
          draft={editDraft}
          works={works}
          disabled={saving}
          excludedWorkId={work.id}
          onChange={onEditDraftChange}
        />
      ) : <WorkTaskDetail work={work} />,
      rowActions: (work) => {
        if (!canEdit && !canDelete) return [];
        const dirty = isWorkDraftDirty(work, editDraft);
        if (editingId === work.id) return [
          {
            key: "save",
            kind: "save",
            label: "保存节点",
            onClick: onSave,
            disabled: saving || !editDraft?.content.trim() || !dirty,
          },
        ];
        return canDelete ? [
          {
            key: "delete",
            kind: "delete",
            label: "删除节点",
            onClick: () => onDelete(work),
            disabled: saving,
          },
        ] : [];
      },
      actionsColumn: { label: "操作", align: "center" },
      scroll: { y: "hidden" },
    } },
  };
}

export default function WorkTaskTable(props: WorkTaskTableProps) {
  const section = useWorkTaskTableSection(props);
  return <PageSurface kind="standard" embedded body={createPageBody([section])} />;
}

function createColumns({
  expandedIds,
  onToggleExpand,
}: {
  expandedIds: Set<number>;
  onToggleExpand: (work: TreeRow) => void;
}): DataSurfaceColumnSpec<TreeRow>[] {
  return [
    {
      key: "content",
      label: "OKR 大纲",
      required: true,
      width: "content",

      cell: (work) => ({
        kind: "group",
        items: [
          {
            kind: "text",
            value: <span className={`block ${depthIndentClassName(work.depth)}`} />,
          },
          work.childCount > 0
            ? {
                kind: "action",
                action: {
                  key: `toggle-${work.id}`,
                  label: (
                    <>
                      <ActionGlyph kind={expandedIds.has(work.id) ? "panel-close" : "panel-open"} className="h-4 w-4" />
                      <span className="sr-only">{expandedIds.has(work.id) ? "收起" : "展开"}</span>
                    </>
                  ),
                  size: "sm",
                  onClick: () => onToggleExpand(work),
                },
              }
            : { kind: "text", value: <span className="block h-8 w-8 shrink-0" /> },
          { kind: "text", value: <TypeBadge itemType={work.itemType} /> },
          {
            kind: "text",
            value: (
              <div className="w-64 min-w-0">
                <div className="truncate text-sm font-medium text-slate-900" title={work.content}>{work.content}</div>
                {work.parentWorkItemContent && <div className="truncate text-xs text-slate-400" title={work.parentWorkItemContent}>上级：{work.parentWorkItemContent}</div>}
              </div>
            ),
          },
        ],
      }),
    },
    {
      key: "status",
      label: "子任务状态",
      defaultVisible: true,
      width: 160,

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
      width: 192,

      cell: (work) => work.itemType === "task" ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500">
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">重要 {work.importance}</span>
          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-600">紧急 {work.urgency}</span>
        </div>
      ) : <span className="text-sm text-slate-300">-</span>,
    },
  ];
}

function depthIndentClassName(depth: number) {
  if (depth <= 0) return "ps-0";
  if (depth === 1) return "ps-5";
  if (depth === 2) return "ps-10";
  if (depth === 3) return "ps-16";
  return "ps-20";
}

function buildTreeRows(
  works: WorkItem[],
  filters: {
    statusFilter: "active" | "done" | "archived";
    itemTypeFilter: "all" | WorkItemType;
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
    itemTypeFilter: "all" | WorkItemType;
  },
) {
  return matchesStatusFilter(work, filters.statusFilter)
    && (filters.itemTypeFilter === "all" || work.itemType === filters.itemTypeFilter);
}

function TypeBadge({ itemType }: { itemType: WorkItemType }) {
  const label = itemType === "objective" ? "目标" : itemType === "key_result" ? "关键结果" : "子任务";
  const className = itemType === "objective"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : itemType === "key_result"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold ${className}`} title={getWorkItemTypeLabel(itemType)}>{label}</span>;
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

function statusClassName(status: string) {
  if (status === "done") return "bg-sky-50 text-sky-700";
  if (status === "archived") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}
