"use client";

import { useEffect, useMemo, useState } from "react";
import { createPageBody, type BodySurfaceCommandSpec, type BodySurfaceSectionCreateSpec, type DataSurfaceCellSpec, type DataSurfaceColumnSpec, type DataSurfaceRowActionSpec, type FormSurfaceActionSpec, BodySurface, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { createEmptyWorkDraft, isWorkDraftDirty } from "./model";
import { createWorkTaskDetailForm } from "./WorkTaskDetail";
import { useWorkTaskFormSurface } from "./WorkTaskFields";
import { createWorkItemOutlineCell, WORK_ITEM_OUTLINE_COLUMN_WIDTH } from "./work-item-outline-cell";
import { shouldShowWorkOwner } from "./work-target-presentation";
import { matchesWorkStatusFilter, type WorkStatusFilter } from "./work-status-filter";
import type { WorkItem, WorkItemDraft, WorkItemType, WorkTarget } from "./types";

type TreeRow = WorkItem & {
  depth: number;
  childCount: number;
};
type WorkTaskTableRowState = "normal" | "selected" | "section" | "total" | "muted" | "warning" | "danger" | "info";

export type WorkTaskTableProps = {
  sectionKey?: string;
  sectionTitle?: string;
  sectionActions?: BodySurfaceCommandSpec[];
  sectionCreate?: BodySurfaceSectionCreateSpec;
  tableLabel?: string;
  emptyText?: string;
  works: WorkItem[];
  formWorks?: WorkItem[];
  loading: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canArchive?: boolean;
  saving: boolean;
  detailId: number | null;
  editingId: number | null;
  editDraft: WorkItemDraft | null;
  editFormActions?: FormSurfaceActionSpec[];
  resultDisabled?: boolean;
  target?: WorkTarget | null;
  showOwnerColumn?: boolean;
  statusFilter: WorkStatusFilter;
  itemTypeFilter: "all" | WorkItemType;
  groupByObjective?: boolean;
  rowState?: (work: WorkItem) => WorkTaskTableRowState;
  scrollX?: boolean;
  showActionsColumn?: boolean;
  visibleColumns?: string[];
  columnWidths?: Array<string | number | null>;
  showOutlineRelations?: boolean;
  showOutlineAllocation?: boolean;
  outlineNote?: (work: WorkItem) => string | null;
  detailCell?: (work: WorkItem) => DataSurfaceCellSpec;
  canEditWork?: (work: WorkItem) => boolean;
  canDeleteWork?: (work: WorkItem) => boolean;
  canArchiveWork?: (work: WorkItem) => boolean;
  onDetail: (work: WorkItem) => void;
  onEdit: (work: WorkItem) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onEditDraftChange: (draft: WorkItemDraft) => void;
  onDelete: (work: WorkItem) => void;
  onArchive?: (work: WorkItem) => void;
  onRestore?: (work: WorkItem) => void;
};

type WorkTaskTableSection = BodySurfaceSectionSpec;

export function useWorkTaskTableSection({
  works,
  formWorks = works,
  sectionKey = "task-table",
  sectionTitle,
  sectionActions,
  sectionCreate,
  tableLabel = "OKR 大纲",
  emptyText = "暂无节点",
  loading,
  canEdit,
  canDelete,
  canArchive = false,
  saving,
  detailId,
  editingId,
  editDraft,
  editFormActions,
  resultDisabled,
  target = null,
  showOwnerColumn,
  statusFilter,
  itemTypeFilter,
  groupByObjective = false,
  rowState,
  scrollX = false,
  showActionsColumn = true,
  visibleColumns: providedVisibleColumns,
  columnWidths: providedColumnWidths,
  showOutlineRelations = true,
  showOutlineAllocation = true,
  outlineNote,
  detailCell,
  canEditWork,
  canDeleteWork,
  canArchiveWork,
  onDetail,
  onEdit,
  onSave,
  onCancelEdit,
  onEditDraftChange,
  onDelete,
  onArchive,
  onRestore,
}: WorkTaskTableProps): WorkTaskTableSection {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const tree = useMemo(
    () => buildTreeRows(works, { statusFilter, itemTypeFilter, expandedIds, groupByObjective }),
    [expandedIds, groupByObjective, itemTypeFilter, statusFilter, works],
  );
  const emptyEditDraft = useMemo(() => createEmptyWorkDraft(), []);
  const editFormSurface = useWorkTaskFormSurface({
    draft: editDraft ?? emptyEditDraft,
    works: formWorks,
    disabled: saving,
    resultDisabled: saving || resultDisabled,
    excludedWorkId: editingId,
    allowedItemTypes: editDraft ? [editDraft.itemType] : undefined,
    target,
    enabled: Boolean(editDraft),
    onChange: onEditDraftChange,
  });
  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set(current);
      for (const work of works) {
        if (works.some((item) => item.parentWorkItemId === work.id)) next.add(work.id);
      }
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [works]);

  const columns = createColumns({
    tableLabel,
    routineMode: !groupByObjective,
    expandedIds,
    showOutlineRelations,
    showOutlineAllocation,
    outlineNote,
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
      key: sectionKey,
      header: sectionTitle ? { title: sectionTitle, actions: sectionActions, create: sectionCreate } : undefined,
      body: { kind: "section", status: { kind: "empty", content: emptyText } },
    };
  }

  const canOpenEditor = canEdit;
  const ownerVisible = showOwnerColumn ?? shouldShowWorkOwner(target);
  const matrixColumnWidths = providedColumnWidths ?? (groupByObjective ? [
    WORK_ITEM_OUTLINE_COLUMN_WIDTH,
    ...(ownerVisible ? [null] : []),
    null,
    null,
    ...(showActionsColumn ? ["7.5rem"] : []),
  ] : [
    WORK_ITEM_OUTLINE_COLUMN_WIDTH,
    ...(ownerVisible ? [null] : []),
    null,
    ...(showActionsColumn ? ["7.5rem"] : []),
  ]);
  const defaultVisibleColumns = groupByObjective ? ["owner", "plannedRange", "actualRange"] : ["owner", "responsibility"];
  const visibleColumns = (providedVisibleColumns ?? defaultVisibleColumns).filter((key) => ownerVisible || key !== "owner");

  return {
    key: sectionKey,
    header: sectionTitle ? { title: sectionTitle, actions: sectionActions, create: sectionCreate } : undefined,
    body: { kind: "data", data: {
      kind: "table",
      rows: tree.rows,
      columns,
      format: { kind: "matrix", columnWidths: matrixColumnWidths },
      mobile: { presentation: "list" },
      visibleColumns,

      loading,
      emptyText: "暂无节点",
      rowKey: (work) => work.id,
      rowState: (work) => rowState?.(work) ?? (work.itemType === "key_result" ? "muted" : "normal"),
      onRowClick: (work) => {
        const editable = canOpenEditor && (!canEditWork || canEditWork(work));
        if (!editable) {
          onDetail(work);
          return;
        }
        if (editingId === work.id) {
          onCancelEdit();
          return;
        }
        onEdit(work);
      },
      expandedRowKeys: expandedRowKeys({ editingId, detailId }),
      expandedRow: (work) => {
        if (editDraft && editingId === work.id) {
          return { kind: "form", form: { ...editFormSurface, actions: editFormActions } };
        }
        return detailCell?.(work) ?? { kind: "form", form: createWorkTaskDetailForm(work) };
      },
      rowActions: showActionsColumn ? (work) => {
        const editable = !canEditWork || canEditWork(work);
        const deletable = !canDeleteWork || canDeleteWork(work);
        const archivable = !canArchiveWork || canArchiveWork(work);
        if ((!canEdit && !canDelete && !canArchive) || (!editable && !deletable && !archivable)) return [];
        const dirty = isWorkDraftDirty(work, editDraft);
        if (editingId === work.id) {
          if (editFormActions) return [];
          const actions: DataSurfaceRowActionSpec[] = [];
          if (canEdit && editable) actions.push({
            key: "save",
            kind: "save",
            label: "保存节点",
            onClick: onSave,
            disabled: saving || !editDraft?.content.trim() || !dirty,
          });
          return actions;
        }
        const archived = work.isArchived;
        return [
          ...(canArchive && archivable ? archived && onRestore ? [{
            key: "restore",
            kind: "restore" as const,
            label: "恢复任务",
            onClick: () => onRestore(work),
            disabled: saving,
          }] : !archived && onArchive ? [{
            key: "archive",
            kind: "archive" as const,
            label: "归档任务",
            onClick: () => onArchive(work),
            disabled: saving,
          }] : [] : []),
          ...(canDelete && deletable ? [{
            key: "delete",
            kind: "delete" as const,
            label: "删除节点",
            onClick: () => onDelete(work),
            disabled: saving,
          }] : []),
        ] satisfies DataSurfaceRowActionSpec[];
      } : undefined,
      actionsColumn: showActionsColumn ? { label: "操作", align: "center" } : undefined,
      scroll: { x: scrollX || undefined, y: "hidden" },
    } },
  };
}

function expandedRowKeys({
  editingId,
  detailId,
}: {
  editingId: number | null;
  detailId: number | null;
}) {
  const keys = new Set<number>();
  if (editingId != null) keys.add(editingId);
  else if (detailId != null) keys.add(detailId);
  return keys;
}

export default function WorkTaskTable(props: WorkTaskTableProps) {
  const section = useWorkTaskTableSection(props);
  return <BodySurface {...createPageBody([section])} />;
}

function createColumns({
  tableLabel,
  routineMode,
  expandedIds,
  showOutlineRelations,
  showOutlineAllocation,
  outlineNote,
  onToggleExpand,
}: {
  tableLabel: string;
  routineMode: boolean;
  expandedIds: Set<number>;
  showOutlineRelations: boolean;
  showOutlineAllocation: boolean;
  outlineNote?: (work: WorkItem) => string | null;
  onToggleExpand: (work: TreeRow) => void;
}): DataSurfaceColumnSpec<TreeRow>[] {
  const columns: DataSurfaceColumnSpec<TreeRow>[] = [
    {
      key: "content",
      label: tableLabel,
      required: true,
      width: "content",
      cell: (work) => createWorkItemOutlineCell(work, {
        depth: work.depth,
        collapsible: work.childCount > 0,
        expanded: expandedIds.has(work.id),
        showParent: false,
        showAllocation: showOutlineAllocation,
        showRelations: showOutlineRelations,
        showTypeBadge: !(routineMode && work.routineTaskType === "standing"),
        note: outlineNote?.(work),
        onToggle: () => onToggleExpand(work),
      }),
    },
    { key: "owner", label: "负责人", defaultVisible: true, cell: (work) => work.ownerEmployeeName || { kind: "empty" } },
    ...(routineMode ? [
      { key: "responsibility", label: "所属职责", defaultVisible: true, cell: (work) => responsibilityLabel(work) },
    ] satisfies DataSurfaceColumnSpec<TreeRow>[] : [
    {
      key: "plannedRange",
      label: "计划起止",
      defaultVisible: true,
      cell: (work) => dateRangeCell(work.plannedStartDate, work.plannedEndDate),
    },
    {
      key: "actualRange",
      label: "实际起止",
      defaultVisible: true,
      cell: (work) => dateRangeCell(work.actualStartDate, work.actualEndDate),
    },
    ] satisfies DataSurfaceColumnSpec<TreeRow>[]),
  ];
  return columns;
}

function responsibilityLabel(work: WorkItem): DataSurfaceCellSpec {
  const label = work.routineTaskType === "task" ? work.parentWorkItemContent : work.responsibilityLabel;
  return label ? { kind: "text", value: label } : { kind: "empty" };
}

function dateRangeCell(actualStartDate: string | null, endDate: string | null): DataSurfaceCellSpec {
  if (!actualStartDate && !endDate) return { kind: "empty" };
  return {
    kind: "stack",
    gap: "none",
    items: [
      { kind: "text", value: actualStartDate || "-", tone: actualStartDate ? undefined : "muted" },
      { kind: "text", value: endDate || "-", tone: endDate ? undefined : "muted" },
    ],
  };
}

function buildTreeRows(
  works: WorkItem[],
  filters: {
    statusFilter: WorkStatusFilter;
    itemTypeFilter: "all" | WorkItemType;
    expandedIds: Set<number>;
    groupByObjective?: boolean;
  },
) {
  if (filters.groupByObjective) return objectiveGroupedRows(works, filters);
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

function objectiveGroupedRows(
  works: WorkItem[],
  filters: {
    statusFilter: WorkStatusFilter;
    expandedIds: Set<number>;
  },
) {
  const objectives = works
    .filter((work) => work.itemType === "objective" && !work.parentWorkItemId && matchesWorkStatusFilter(work, filters.statusFilter))
    .sort(sortWorks);
  const objectiveIds = new Set(objectives.map((work) => work.id));
  const childrenByObjective = new Map<number, WorkItem[]>();
  const orphans: WorkItem[] = [];
  for (const work of works) {
    if (work.itemType === "objective" && !work.parentWorkItemId) continue;
    if (work.parentWorkItemId && objectiveIds.has(work.parentWorkItemId)) {
      childrenByObjective.set(work.parentWorkItemId, [...(childrenByObjective.get(work.parentWorkItemId) || []), work]);
    } else if (matchesObjectiveGroupedChild(work, filters.statusFilter)) {
      orphans.push(work);
    }
  }

  const rows: TreeRow[] = [];
  for (const objective of objectives) {
    const children = (childrenByObjective.get(objective.id) || [])
      .filter((work) => matchesObjectiveGroupedChild(work, filters.statusFilter))
      .sort(sortWorks);
    rows.push({ ...objective, depth: 0, childCount: children.length });
    if (!filters.expandedIds.has(objective.id)) continue;
    for (const child of children) rows.push({ ...child, depth: 1, childCount: 0 });
  }
  for (const orphan of orphans.sort(sortWorks)) rows.push({ ...orphan, depth: 0, childCount: 0 });
  return { rows };
}

function matchesObjectiveGroupedChild(work: WorkItem, statusFilter: WorkStatusFilter) {
  if (work.itemType === "key_result") return statusFilter !== "archived" && !work.isArchived;
  return matchesWorkStatusFilter(work, statusFilter);
}

function matchesFilters(
  work: WorkItem,
  filters: {
    statusFilter: WorkStatusFilter;
    itemTypeFilter: "all" | WorkItemType;
  },
) {
  return matchesWorkStatusFilter(work, filters.statusFilter)
    && (filters.itemTypeFilter === "all" || work.itemType === filters.itemTypeFilter);
}

function sortWorks(a: WorkItem, b: WorkItem) {
  return (itemTypeOrder(a.itemType) - itemTypeOrder(b.itemType)) || (a.sortOrder - b.sortOrder) || (a.id - b.id);
}

function itemTypeOrder(itemType: WorkItemType) {
  if (itemType === "objective") return 0;
  if (itemType === "task") return 1;
  return 2;
}
