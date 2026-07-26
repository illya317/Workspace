"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPageBody,
  createSectionSection,
  createStatusSection,
  type BodySurfaceProps,
  type BodySurfaceSectionSpec,
  type BodySurfaceSelectorProps,
} from "@workspace/core/ui";
import { fetchWorkPeriodCollection, listWorkItems } from "./api";
import {
  createInitialGoalCycles,
  createInitialGoalPreviewModel,
  defaultInitialGoalCycleKey,
  type InitialGoalAlignedKind,
  type InitialGoalCycle,
} from "./initial-goal-preview-model";
import { useWorkTaskTableSection } from "./WorkTaskTable";
import { periodScheduleMatrixSectionSpec } from "./WorkPeriodScheduleMatrix";
import { shouldShowWorkOwner } from "./work-target-presentation";
import type { WorkPeriodCollectionResponse } from "./period-collection-types";
import type { WorkItem, WorkPlan, WorkTarget } from "./types";

type InitialGoalPreviewController = {
  leftNavigationBody: BodySurfaceSelectorProps;
  rightBody: BodySurfaceProps;
};

const ALIGNED_GROUPS: Array<{ kind: InitialGoalAlignedKind; title: string }> = [
  { kind: "department", title: "部门承接" },
  { kind: "project", title: "项目承接" },
  { kind: "collaboration", title: "个人协作" },
];

export function useInitialGoalPreview({
  active,
  target,
  plans,
  plansLoading,
  onToast,
}: {
  active: boolean;
  target: WorkTarget | null;
  plans: WorkPlan[];
  plansLoading: boolean;
  onToast: (message: string, type: "success" | "error") => void;
}): InitialGoalPreviewController {
  const year = new Date().getFullYear();
  const cycles = useMemo(() => createInitialGoalCycles(year), [year]);
  const [cycleKey, setCycleKey] = useState(() => defaultInitialGoalCycleKey());
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [periodCollection, setPeriodCollection] = useState<WorkPeriodCollectionResponse | null>(null);
  const [periodCollectionLoading, setPeriodCollectionLoading] = useState(false);
  const [collapsedScheduleSourceIds, setCollapsedScheduleSourceIds] = useState<Set<number>>(() => new Set());
  const [compactMatrix, setCompactMatrix] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const cycle = cycles.find((item) => item.key === cycleKey) ?? cycles[0];
  const rootPlan = useMemo(() => cycleRootPlan(plans, cycle), [cycle, plans]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompactMatrix(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!active || !target) {
      setWorks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listWorkItems(target, null)
      .then((nextWorks) => { if (!cancelled) setWorks(nextWorks); })
      .catch((error) => { if (!cancelled) onToast(error instanceof Error ? error.message : "加载期初目标失败", "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active, onToast, target]);

  useEffect(() => {
    let cancelled = false;
    if (!active || !target || !rootPlan?.okrCycleId) {
      setPeriodCollection(null);
      setPeriodCollectionLoading(false);
      return;
    }
    setPeriodCollection(null);
    setPeriodCollectionLoading(true);
    fetchWorkPeriodCollection(target, rootPlan.okrCycleId, { includeItems: true })
      .then((collection) => { if (!cancelled) setPeriodCollection(collection); })
      .catch((error) => { if (!cancelled) onToast(error instanceof Error ? error.message : "加载任务目标失败", "error"); })
      .finally(() => { if (!cancelled) setPeriodCollectionLoading(false); });
    return () => { cancelled = true; };
  }, [active, onToast, rootPlan?.id, rootPlan?.okrCycleId, target]);

  useEffect(() => {
    setDetailId(null);
    setCollapsedScheduleSourceIds(new Set());
  }, [cycleKey, target?.targetId, target?.targetType]);

  const model = useMemo(
    () => target ? createInitialGoalPreviewModel({ target, plans, works, cycle }) : emptyPreviewModel(),
    [cycle, plans, target, works],
  );
  const objectivePeriodCollection = useMemo(() => periodCollection ? {
    ...periodCollection,
    items: periodCollection.items.filter((entry) => entry.item.itemType !== "task" && !model.sourceByWorkId.has(entry.item.id)),
  } : null, [model.sourceByWorkId, periodCollection]);
  const toggleDetail = (work: WorkItem) => {
    if (!work.description?.trim()) return;
    setDetailId((current) => current === work.id ? null : work.id);
  };
  const tableLoading = plansLoading || loading;
  const showOwner = shouldShowWorkOwner(target);
  const routineSection = usePreviewTableSection({
    key: "initial-goal-routine",
    title: "日常工作",
    tableLabel: "日常职责",
    emptyText: "当前空间暂无生效中的日常职责",
    works: model.routineWorks,
    loading: tableLoading,
    detailId,
    visibleColumns: showOwner ? ["owner", "responsibility"] : ["responsibility"],
    columnWidths: showOwner ? ["28rem", "8rem", null] : ["28rem", null],
    onDetail: toggleDetail,
  });
  const objectiveSection = rootPlan ? periodScheduleMatrixSectionSpec({
    title: "任务目标",
    rootPlan,
    works: model.objectiveWorks.filter((work) => work.planId === rootPlan.id),
    collection: objectivePeriodCollection,
    loading: tableLoading || periodCollectionLoading,
    canCreate: false,
    showOwner,
    compact: compactMatrix,
    collapsedSourceIds: collapsedScheduleSourceIds,
    onToggleSource: (work) => setCollapsedScheduleSourceIds((current) => toggleSetValue(current, work.id)),
  }) : createStatusSection("initial-goal-objectives-empty", { kind: "empty", content: `${cycle.label} 暂无任务目标` });
  const departmentSection = asPlainSection(usePreviewTableSection({
    key: "initial-goal-aligned-department",
    title: "部门承接",
    tableLabel: "承接事项",
    emptyText: "暂无部门承接",
    works: model.alignedWorks.department,
    loading: tableLoading,
    detailId,
    groupByObjective: true,
    visibleColumns: showOwner ? ["owner", "plannedRange"] : ["plannedRange"],
    columnWidths: showOwner ? ["30rem", "8rem", "12rem"] : ["30rem", "12rem"],
    aligned: true,
    outlineNote: (work) => alignedSourceNote(work, model.alignedWorks.department, model.sourceByWorkId),
    onDetail: toggleDetail,
  }));
  const projectSection = asPlainSection(usePreviewTableSection({
    key: "initial-goal-aligned-project",
    title: "项目承接",
    tableLabel: "承接事项",
    emptyText: "暂无项目承接",
    works: model.alignedWorks.project,
    loading: tableLoading,
    detailId,
    groupByObjective: true,
    visibleColumns: showOwner ? ["owner", "plannedRange"] : ["plannedRange"],
    columnWidths: showOwner ? ["30rem", "8rem", "12rem"] : ["30rem", "12rem"],
    aligned: true,
    outlineNote: (work) => alignedSourceNote(work, model.alignedWorks.project, model.sourceByWorkId),
    onDetail: toggleDetail,
  }));
  const collaborationSection = asPlainSection(usePreviewTableSection({
    key: "initial-goal-aligned-collaboration",
    title: "个人协作",
    tableLabel: "承接事项",
    emptyText: "暂无个人协作",
    works: model.alignedWorks.collaboration,
    loading: tableLoading,
    detailId,
    groupByObjective: true,
    visibleColumns: showOwner ? ["owner", "plannedRange"] : ["plannedRange"],
    columnWidths: showOwner ? ["30rem", "8rem", "12rem"] : ["30rem", "12rem"],
    aligned: true,
    outlineNote: (work) => alignedSourceNote(work, model.alignedWorks.collaboration, model.sourceByWorkId),
    onDetail: toggleDetail,
  }));
  const alignedSections = [departmentSection, projectSection, collaborationSection];
  const visibleAlignedSections = alignedSections.filter((_, index) => tableLoading || model.alignedWorks[ALIGNED_GROUPS[index].kind].length > 0);
  const alignedSection = createSectionSection("initial-goal-aligned", {
    title: "承接任务",
    sections: visibleAlignedSections.length > 0
      ? visibleAlignedSections
      : [asPlainSection(createStatusSection("initial-goal-aligned-empty", { kind: "empty", content: `${cycle.label} 暂无承接任务` }))],
  });

  return {
    leftNavigationBody: initialGoalCycleNavigationBody({ cycles, cycle, model, loading: tableLoading, onSelect: (next) => setCycleKey(next.key) }),
    rightBody: createPageBody([routineSection, objectiveSection, alignedSection]),
  };
}

function usePreviewTableSection({
  key,
  title,
  tableLabel,
  emptyText,
  works,
  loading,
  detailId,
  groupByObjective = false,
  visibleColumns,
  columnWidths,
  aligned = false,
  outlineNote,
  onDetail,
}: {
  key: string;
  title: string;
  tableLabel: string;
  emptyText: string;
  works: WorkItem[];
  loading: boolean;
  detailId: number | null;
  groupByObjective?: boolean;
  visibleColumns?: string[];
  columnWidths?: Array<string | number | null>;
  aligned?: boolean;
  outlineNote?: (work: WorkItem) => string | null;
  onDetail: (work: WorkItem) => void;
}): BodySurfaceSectionSpec {
  return useWorkTaskTableSection({
    sectionKey: key,
    sectionTitle: title,
    tableLabel,
    emptyText,
    works,
    loading,
    canEdit: false,
    canDelete: false,
    saving: false,
    detailId,
    editingId: null,
    editDraft: null,
    workflowRequests: [],
    statusFilter: "active",
    itemTypeFilter: "all",
    groupByObjective,
    scrollX: true,
    showActionsColumn: false,
    visibleColumns,
    columnWidths,
    showOutlineRelations: !aligned,
    showOutlineAllocation: !aligned,
    outlineNote,
    detailCell: (work) => ({ kind: "text", value: work.description || "暂无说明", tone: work.description ? "default" : "muted", wrap: "wrap" }),
    onDetail,
    onEdit: () => undefined,
    onSave: () => undefined,
    onCancelEdit: () => undefined,
    onEditDraftChange: () => undefined,
    onDelete: () => undefined,
  });
}

function asPlainSection(section: BodySurfaceSectionSpec): BodySurfaceSectionSpec {
  return section;
}

function alignedSourceNote(
  work: WorkItem,
  works: WorkItem[],
  sourceByWorkId: ReadonlyMap<number, { summary: string }>,
) {
  const source = sourceByWorkId.get(work.id);
  if (!source) return null;
  const parent = work.parentWorkItemId ? works.find((item) => item.id === work.parentWorkItemId) : null;
  const parentSource = parent ? sourceByWorkId.get(parent.id) : null;
  return parentSource?.summary === source.summary ? null : source.summary;
}

function cycleRootPlan(plans: WorkPlan[], cycle: InitialGoalCycle) {
  return plans
    .filter((plan) => plan.kind === "okr" && !plan.isArchived && dateOnly(plan.plannedStartDate) === cycle.start && dateOnly(plan.plannedEndDate) === cycle.end)
    .sort((left, right) => Number(right.isSystemGenerated) - Number(left.isSystemGenerated) || left.id - right.id)[0] ?? null;
}

function toggleSetValue(current: Set<number>, value: number) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function initialGoalCycleNavigationBody({
  cycles,
  cycle,
  model,
  loading,
  onSelect,
}: {
  cycles: InitialGoalCycle[];
  cycle: InitialGoalCycle;
  model: ReturnType<typeof createInitialGoalPreviewModel>;
  loading: boolean;
  onSelect: (cycle: InitialGoalCycle) => void;
}): BodySurfaceSelectorProps {
  const alignedCount = Object.values(model.alignedWorks).reduce((total, rows) => total + rows.length, 0);
  return {
    kind: "selector",
    selector: {
      kind: "list",
      title: "职责与目标",
      loading,
      loadingText: "加载期初目标中...",
      emptyText: "暂无目标周期",
      items: cycles.map((item) => ({
        key: item.key,
        value: item,
        card: {
          title: item.label,
          subtitle: `${item.start} - ${item.end}`,
          meta: item.key === cycle.key ? [`目标 ${model.objectiveWorks.length}项`, `承接 ${alignedCount}项`] : undefined,
          active: item.key === cycle.key,
        },
      })),
      selectedId: cycle.key,
      onSelect,
      size: "sm",
    },
  };
}

function emptyPreviewModel(): ReturnType<typeof createInitialGoalPreviewModel> {
  return {
    routineWorks: [],
    objectiveWorks: [],
    alignedWorks: { department: [], project: [], collaboration: [] },
    sourceByWorkId: new Map(),
  };
}
