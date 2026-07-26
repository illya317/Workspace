"use client";

import { type BodySurfaceSectionSpec, type DataSurfaceCellSpec, type DataSurfaceStructuredCellSpec } from "@workspace/core/ui";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";
import { formatWorkDate } from "./model";
import { WorkPeriodScheduleCompactSourceCell } from "./WorkPeriodScheduleCompactSourceCell";
import { shouldShowWorkOwner } from "./work-target-presentation";
import type {
  WorkItem,
  WorkItemType,
  WorkOkrPeriodType,
  WorkPlan,
} from "./types";
import type { WorkPeriodCollectionCycle, WorkPeriodCollectionItem, WorkPeriodCollectionResponse } from "./period-collection-types";
import { scheduleCreateSurfaceSpec, type WorkPeriodScheduleCreateContext, type WorkPeriodScheduleCreateDraft } from "./work-period-schedule-create-modal";
export type { WorkPeriodScheduleCreateContext, WorkPeriodScheduleCreateDraft, WorkPeriodScheduleCreateInput } from "./work-period-schedule-create-modal";

type MatrixRow = {
  key: string;
  label: string;
  depth: number;
  sourceItem: WorkItem;
  itemType: Extract<WorkItemType, "objective" | "key_result">;
  parentObjective: WorkItem | null;
  childCount: number;
  childSourceIds: number[];
};

type ScheduleCreateBindings = {
  pendingCreate: WorkPeriodScheduleCreateContext | null;
  createDraft: WorkPeriodScheduleCreateDraft | null;
  createRuntime: ActionRuntime;
  onCreateDraftChange: (draft: WorkPeriodScheduleCreateDraft) => void;
  onConfirmCreate: () => void | Promise<void>;
  onCancelCreate: () => void;
  onStartCreate: (input: WorkPeriodScheduleCreateContext) => void;
};

export function periodScheduleMatrixSectionSpec({
  title = "时间安排",
  rootPlan,
  works,
  collection,
  loading,
  canCreate,
  showOwner,
  compact = false,
  savingKey,
  createRuntime,
  pendingCreate,
  createDraft,
  onCreateDraftChange,
  onConfirmCreate,
  onCancelCreate,
  onStartCreate,
  onOpenPlan,
  collapsedSourceIds,
  onToggleSource,
}: {
  title?: string;
  rootPlan: WorkPlan | null;
  works: WorkItem[];
  collection: WorkPeriodCollectionResponse | null;
  loading: boolean;
  canCreate: boolean;
  showOwner?: boolean;
  compact?: boolean;
  savingKey?: string | null;
  createRuntime?: ActionRuntime | null;
  pendingCreate?: WorkPeriodScheduleCreateContext | null;
  createDraft?: WorkPeriodScheduleCreateDraft | null;
  onCreateDraftChange?: (draft: WorkPeriodScheduleCreateDraft) => void;
  onConfirmCreate?: () => void | Promise<void>;
  onCancelCreate?: () => void;
  onStartCreate?: (input: WorkPeriodScheduleCreateContext) => void;
  onOpenPlan?: (planId: number) => void;
  collapsedSourceIds?: Set<number>;
  onToggleSource?: (work: WorkItem) => void;
}): BodySurfaceSectionSpec {
  const rows = matrixRows({ works, collapsedSourceIds });
  const cycles = collection?.cycles ?? [];
  const ownerVisible = showOwner ?? shouldShowWorkOwner(rootPlan);
  const createBindings = createRuntime && onCreateDraftChange && onConfirmCreate && onCancelCreate && onStartCreate ? {
    pendingCreate: pendingCreate ?? null,
    createDraft: createDraft ?? null,
    createRuntime,
    onCreateDraftChange,
    onConfirmCreate,
    onCancelCreate,
    onStartCreate,
  } satisfies ScheduleCreateBindings : undefined;
  const matrixCells = loading
    ? messageRows("加载中...", compact ? 1 : cycles.length)
    : cycles.length === 0
      ? messageRows("暂无下级周期", compact ? 1 : cycles.length)
      : rows.length === 0
        ? messageRows("暂无目标安排", compact ? 1 : cycles.length)
        : compact
          ? structuredRowsForCompactMatrix({ rootPlan, collection, rows, cycles, canCreate, showOwner: ownerVisible, savingKey, createBindings, onOpenPlan, collapsedSourceIds, onToggleSource })
          : structuredRowsForMatrix({ rootPlan, collection, rows, cycles, canCreate, showOwner: ownerVisible, savingKey, createBindings, onOpenPlan, collapsedSourceIds, onToggleSource });
  return {
    key: "work-period-schedule-matrix",
    visibility: "desktop",
    header: {
      title,
      badges: collection?.displayPeriodType ? [
        { key: "period-type", label: periodTypeBadge(collection.displayPeriodType), tone: "info" },
      ] : undefined,
    },
    body: {
      kind: "section",
      sections: [{
        key: "work-period-schedule-matrix-table",
        body: {
          kind: "data",
          data: {
            kind: "structured",
            rows: matrixCells,
            format: { kind: "matrix", columnWidths: compact ? ["6.5rem", null] : Array.from({ length: cycles.length + 1 }, () => null) },
          },
        },
      }],
    },
  };
}

function matrixRows({
  works,
  collapsedSourceIds,
}: {
  works: WorkItem[];
  collapsedSourceIds?: Set<number>;
}): MatrixRow[] {
  const activeWorks = works.filter((work) => !work.isArchived && (work.itemType === "objective" || work.itemType === "key_result"));
  const byParent = new Map<number, WorkItem[]>();
  for (const work of activeWorks) {
    if (!work.parentWorkItemId) continue;
    const siblings = byParent.get(work.parentWorkItemId) ?? [];
    siblings.push(work);
    byParent.set(work.parentWorkItemId, siblings);
  }
  const objectives = activeWorks
    .filter((work) => work.itemType === "objective" && !work.parentWorkItemId)
    .sort(sortWorkItems);
  const rows: MatrixRow[] = [];
  for (const objective of objectives) {
    const krs = (byParent.get(objective.id) ?? [])
      .filter((work) => work.itemType === "key_result")
      .sort(sortWorkItems);
    rows.push({
      key: `objective:${objective.id}`,
      label: objective.content,
      depth: 0,
      sourceItem: objective,
      itemType: "objective",
      parentObjective: null,
      childCount: krs.length,
      childSourceIds: krs.map((kr) => kr.id),
    });
    if (collapsedSourceIds?.has(objective.id)) continue;
    for (const kr of krs) {
      rows.push({
        key: `kr:${kr.id}`,
        label: kr.content,
        depth: 1,
        sourceItem: kr,
        itemType: "key_result",
        parentObjective: objective,
        childCount: 0,
        childSourceIds: [],
      });
    }
  }
  return rows;
}

function structuredRowsForMatrix({
  rootPlan,
  collection,
  rows,
  cycles,
  canCreate,
  showOwner,
  savingKey,
  createBindings,
  onOpenPlan,
  collapsedSourceIds,
  onToggleSource,
}: {
  rootPlan: WorkPlan | null;
  collection: WorkPeriodCollectionResponse | null;
  rows: MatrixRow[];
  cycles: WorkPeriodCollectionCycle[];
  canCreate: boolean;
  showOwner: boolean;
  savingKey?: string | null;
  createBindings?: ScheduleCreateBindings;
  onOpenPlan?: (planId: number) => void;
  collapsedSourceIds?: Set<number>;
  onToggleSource?: (work: WorkItem) => void;
}): DataSurfaceStructuredCellSpec[][] {
  return [
    [
      periodScheduleSourceHeader(collection?.rootCycle.periodType ?? rootPlan?.periodType),
      ...cycles.map((cycle) => ({ header: true, align: "center" as const, content: cycleHeader(cycle, collection, rootPlan, onOpenPlan) })),
    ],
    ...rows.map((row) => [
      { content: scheduleSourceLine(row, collapsedSourceIds, onToggleSource), tone: row.itemType === "key_result" ? "muted" as const : undefined },
      ...cycles.map((cycle) => ({
        content: scheduleCell({
          row,
          cycle,
          rootPlan,
          collection,
          canCreate,
          showOwner,
          savingKey,
          createBindings,
        }),
      })),
    ]),
  ];
}

function structuredRowsForCompactMatrix({
  rootPlan,
  collection,
  rows,
  cycles,
  canCreate,
  showOwner,
  savingKey,
  createBindings,
  onOpenPlan,
  collapsedSourceIds,
  onToggleSource,
}: {
  rootPlan: WorkPlan | null;
  collection: WorkPeriodCollectionResponse | null;
  rows: MatrixRow[];
  cycles: WorkPeriodCollectionCycle[];
  canCreate: boolean;
  showOwner: boolean;
  savingKey?: string | null;
  createBindings?: ScheduleCreateBindings;
  onOpenPlan?: (planId: number) => void;
  collapsedSourceIds?: Set<number>;
  onToggleSource?: (work: WorkItem) => void;
}): DataSurfaceStructuredCellSpec[][] {
  return rows.flatMap((row) => [
    [{
      content: scheduleSourceLine(row, collapsedSourceIds, onToggleSource),
      colSpan: 2,
      tone: row.itemType === "key_result" ? "muted" as const : undefined,
    }],
    ...cycles.map((cycle) => [
      { header: true, align: "center" as const, content: cycleHeader(cycle, collection, rootPlan, onOpenPlan) },
      { content: scheduleCell({ row, cycle, rootPlan, collection, canCreate, showOwner, savingKey, createBindings }) },
    ]),
  ]);
}

function messageRows(message: string, cycleCount: number): DataSurfaceStructuredCellSpec[][] {
  return [[{
    content: { kind: "empty", content: message },
    colSpan: Math.max(1, cycleCount + 1),
    tone: "muted",
  }]];
}

function periodScheduleSourceHeader(periodType: WorkOkrPeriodType | string | null | undefined): DataSurfaceStructuredCellSpec {
  return {
    header: true,
    align: "center",
    content: { kind: "text", value: sourceHeaderLabel(periodType) },
  };
}

function sourceHeaderLabel(periodType: WorkOkrPeriodType | string | null | undefined) {
  if (periodType === "yearly") return "年度目标 / KR";
  if (periodType === "half_year") return "半年度目标 / KR";
  if (periodType === "quarterly") return "季度目标 / KR";
  if (periodType === "monthly") return "月度目标 / KR";
  if (periodType === "weekly") return "周任务";
  return "目标 / KR";
}

function scheduleSourceLine(row: MatrixRow, collapsedSourceIds?: Set<number>, onToggleSource?: (work: WorkItem) => void) {
  return (
    <WorkPeriodScheduleCompactSourceCell
      source={row.sourceItem}
      label={row.label}
      itemType={row.itemType}
      depth={row.depth}
      childCount={row.childCount}
      collapsed={Boolean(row.sourceItem && collapsedSourceIds?.has(row.sourceItem.id))}
      onToggle={onToggleSource}
    />
  );
}

function scheduleCell({
  row,
  cycle,
  rootPlan,
  collection,
  canCreate,
  showOwner,
  savingKey,
  createBindings,
}: {
  row: MatrixRow;
  cycle: WorkPeriodCollectionCycle;
  rootPlan: WorkPlan | null;
  collection: WorkPeriodCollectionResponse | null;
  canCreate: boolean;
  showOwner: boolean;
  savingKey?: string | null;
  createBindings?: ScheduleCreateBindings;
}): DataSurfaceCellSpec {
  const entries = entriesForCell(row, cycle, rootPlan, collection);
  const items = entries.map((entry) => scheduleEntryCell(entry, showOwner));
  if (canCreate && createBindings) {
    const itemType = row.itemType === "key_result" ? "key_result" : "objective";
    const key = scheduleCreateKey(row.sourceItem.id, cycle.id, itemType);
    const taskSchedule = isTaskScheduleCycle(rootPlan, cycle);
    const disabled = Boolean(savingKey) || (!taskSchedule && row.itemType === "key_result" && !hasChildObjectiveForKr(collection, rootPlan, row, cycle));
    const context: WorkPeriodScheduleCreateContext = { cycle, sourceItem: row.sourceItem, itemType, parentObjective: row.parentObjective };
    const activeKey = createBindings.pendingCreate
      ? scheduleCreateKey(createBindings.pendingCreate.sourceItem.id, createBindings.pendingCreate.cycle.id, createBindings.pendingCreate.itemType)
      : null;
    items.push({
      kind: "create-trigger",
      create: scheduleCreateSurfaceSpec({
        context,
        open: activeKey === key,
        createDraft: activeKey === key ? createBindings.createDraft : null,
        rootPlan,
        savingKey,
        createRuntime: createBindings.createRuntime,
        disabled,
        onCreateDraftChange: createBindings.onCreateDraftChange,
        onConfirmCreate: createBindings.onConfirmCreate,
        onCancelCreate: createBindings.onCancelCreate,
        onStartCreate: createBindings.onStartCreate,
      }),
    });
  }
  if (items.length === 0) return { kind: "empty" };
  return {
    kind: "group",
    direction: "column",
    items,
  };
}

function hasChildObjectiveForKr(
  collection: WorkPeriodCollectionResponse | null,
  rootPlan: WorkPlan | null,
  row: MatrixRow,
  cycle: WorkPeriodCollectionCycle,
) {
  if (row.itemType !== "key_result") return true;
  if (!collection || !rootPlan || !row.parentObjective) return false;
  return collection.items.some((entry) => (
    entry.planId !== rootPlan.id
    && entry.item.itemType === "objective"
    && entry.item.parentPeriodWorkItemId === row.parentObjective?.id
    && entry.overlapCycleIds.includes(cycle.id)
  ));
}

export function workPeriodScheduleCreateKey(sourceItemId: number, cycleId: number, itemType: Extract<WorkItemType, "objective" | "key_result">) {
  return scheduleCreateKey(sourceItemId, cycleId, itemType);
}

function entriesForCell(
  row: MatrixRow,
  cycle: WorkPeriodCollectionCycle,
  rootPlan: WorkPlan | null,
  collection: WorkPeriodCollectionResponse | null,
) {
  if (!collection || !rootPlan) return [];
  const taskSchedule = isTaskScheduleCycle(rootPlan, cycle);
  return collection.items.filter((entry) => {
    if (!entry.overlapCycleIds.includes(cycle.id)) return false;
    return taskSchedule
      ? taskMatchesScheduleSource(entry.item, row)
      : entry.planId !== rootPlan.id && entry.item.parentPeriodWorkItemId === row.sourceItem?.id;
  }).sort((left, right) => sortWorkItems(left.item, right.item));
}

function taskMatchesScheduleSource(item: WorkItem, row: MatrixRow) {
  if (item.itemType !== "task" || !row.sourceItem) return false;
  if (row.itemType === "key_result") return item.parentPeriodWorkItemId === row.sourceItem.id;
  return item.parentPeriodWorkItemId === row.sourceItem.id
    || (item.parentWorkItemId === row.sourceItem.id && !row.childSourceIds.includes(item.parentPeriodWorkItemId ?? 0));
}

function isTaskScheduleCycle(rootPlan: WorkPlan | null, cycle: WorkPeriodCollectionCycle) {
  return rootPlan?.periodType === "monthly" && cycle.periodType === "weekly";
}

function scheduleEntryCell(entry: WorkPeriodCollectionItem, showOwner: boolean): DataSurfaceCellSpec {
  const ownerLabel = entry.item.ownerEmployeeName || "未设置负责人";
  return {
    kind: "stack",
    gap: "xs",
    items: [
      { kind: "text", value: entry.item.content, emphasis: "medium", wrap: "wrap" },
      ...(showOwner ? [{ kind: "text", value: ownerLabel, tone: "muted", wrap: "wrap" } as const] : []),
    ],
  };
}

function cycleHeader(
  cycle: WorkPeriodCollectionCycle,
  collection: WorkPeriodCollectionResponse | null,
  rootPlan: WorkPlan | null,
  onOpenPlan?: (planId: number) => void,
) {
  const targetPlan = collection?.plans.find((entry) => entry.plan.id !== rootPlan?.id && entry.plan.okrCycleId === cycle.id)
    ?? collection?.plans.find((entry) => entry.plan.id !== rootPlan?.id && entry.overlapCycleIds.includes(cycle.id))
    ?? null;
  const planId = targetPlan?.plan.id ?? null;
  const clickable = Boolean(planId && onOpenPlan);
  const content = (
    <>
      <div className={clickable ? "font-semibold text-slate-700 group-hover:text-sky-700" : "font-semibold text-slate-700"}>{cycleShortLabel(cycle)}</div>
      <div className="text-[11px] font-normal text-slate-400">{formatWorkDate(cycle.startDate)} - {formatWorkDate(cycle.endDate)}</div>
    </>
  );
  if (clickable) {
    return (
      <button type="button" className="group mx-auto block space-y-0.5 text-center cursor-pointer" onClick={() => onOpenPlan?.(planId as number)}>
        {content}
      </button>
    );
  }
  return (
    <div className="space-y-0.5 text-center">
      {content}
    </div>
  );
}

function cycleShortLabel(cycle: WorkPeriodCollectionCycle) {
  const quarter = cycle.code.match(/^\d{4}-(Q\d)$/);
  if (quarter) return quarter[1];
  const half = cycle.code.match(/^\d{4}-(H\d)$/);
  if (half) return half[1];
  const month = cycle.code.match(/^\d{4}-(\d{2})$/);
  if (month) return `${Number(month[1])}月`;
  const week = cycle.code.match(/^\d{4}-W(\d{2})$/);
  if (week) return `W${Number(week[1])}`;
  return cycle.label;
}

function periodTypeBadge(periodType: string) {
  if (periodType === "quarterly") return "季度";
  if (periodType === "monthly") return "月";
  if (periodType === "weekly") return "周";
  if (periodType === "half_year") return "半年";
  if (periodType === "yearly") return "年";
  return periodType;
}

function sortWorkItems(left: WorkItem, right: WorkItem) {
  return (left.sortOrder || 0) - (right.sortOrder || 0) || left.id - right.id;
}

function scheduleCreateKey(sourceItemId: number, cycleId: number, itemType: Extract<WorkItemType, "objective" | "key_result">) {
  return `schedule-create:${itemType}:${sourceItemId}:${cycleId}`;
}
