"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWorkPeriodCollection, postWorkPeriodScheduleItem, type WorkPeriodScheduleCreateResult } from "./api";
import type { WorkPeriodCollectionResponse } from "./period-collection-types";
import type { WorkItem, WorkOkrPeriodType, WorkPlan, WorkTarget, WorkTaskSpace } from "./types";
import { createScheduleCreateDraft } from "./work-period-schedule-create-modal";
import { periodScheduleMatrixSectionSpec, workPeriodScheduleCreateKey, type WorkPeriodScheduleCreateContext,
  type WorkPeriodScheduleCreateDraft, type WorkPeriodScheduleCreateInput } from "./WorkPeriodScheduleMatrix";
type PeriodScheduleWorkspaceInput = {
  plan: WorkPlan | null; target: WorkTarget | null; works: WorkItem[]; canCreate: boolean; compact: boolean;
  createRuntime: WorkTaskSpace["actionRuntimes"]["itemCreate"] | null;
  onOpenPlan: (planId: number, plan: WorkPlan | null) => void; onToast: (message: string, type: "success" | "error") => void;
};
export function useWorkPeriodScheduleWorkspace({
  plan, target, works, canCreate, compact, createRuntime, onOpenPlan, onToast,
}: PeriodScheduleWorkspaceInput) {
  const [collection, setCollection] = useState<WorkPeriodCollectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [createContext, setCreateContext] = useState<WorkPeriodScheduleCreateContext | null>(null);
  const [createDraft, setCreateDraft] = useState<WorkPeriodScheduleCreateDraft | null>(null);
  const [collapsedSourceIds, setCollapsedSourceIds] = useState<Set<number>>(() => new Set());
  const loadCollection = useCallback(async (isCancelled?: () => boolean) => {
    if (!target || plan?.kind !== "okr" || !plan.okrCycleId) {
      if (isCancelled?.()) return;
      setCollection(null); setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchWorkPeriodCollection(target, plan.okrCycleId, {
        displayPeriodType: defaultScheduleDisplayPeriodType(plan.periodType),
        includeItems: true,
      });
      if (!isCancelled?.()) setCollection(next);
    } catch (error) {
      if (isCancelled?.()) return;
      setCollection(null);
      onToast(error instanceof Error ? error.message : "加载时间安排失败", "error");
    } finally {
      if (!isCancelled?.()) setLoading(false);
    }
  }, [onToast, plan, target]);
  useEffect(() => { let cancelled = false; void loadCollection(() => cancelled); return () => { cancelled = true; }; }, [loadCollection]);
  useEffect(() => {
    setCollapsedSourceIds(new Set()); setCreateContext(null); setCreateDraft(null);
  }, [plan?.id]);
  const create = useCallback(async (input: WorkPeriodScheduleCreateInput, options?: { surface?: boolean }) => {
    if (!plan || !target || savingKey) return;
    setSavingKey(workPeriodScheduleCreateKey(input.sourceItem.id, input.cycle.id, input.itemType));
    try {
      const created = await postWorkPeriodScheduleItem({
        rootPlanId: plan.id, cycleId: input.cycle.id, sourceItemId: input.sourceItem.id,
        itemType: input.itemType, content: input.content, description: input.description,
        status: input.status, importance: input.importance, urgency: input.urgency,
        ownerEmployeeId: input.ownerEmployeeId, actualStartDate: input.actualStartDate, actualEndDate: input.actualEndDate,
        plannedStartDate: input.plannedStartDate, plannedEndDate: input.plannedEndDate,
      });
      if (created.executionMode === "workflow") {
        if (!options?.surface) onToast("时间安排已提交审核", "success");
      } else {
        setCollection((current) => mergeCreatedItem(current, created.schedule));
        if (!options?.surface) onToast("时间安排已新增", "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "准备时间安排失败";
      if (!options?.surface) onToast(message, "error");
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setSavingKey(null);
    }
  }, [onToast, plan, savingKey, target]);
  const startCreate = useCallback((input: WorkPeriodScheduleCreateContext) => {
    if (savingKey) return;
    setCreateContext(input); setCreateDraft(createScheduleCreateDraft(input, plan));
  }, [plan, savingKey]);
  const cancelCreate = useCallback(() => {
    if (savingKey) return;
    setCreateContext(null); setCreateDraft(null);
  }, [savingKey]);
  const confirmCreate = useCallback(async () => {
    const content = createDraft?.content.trim() ?? "";
    if (!createContext || !createDraft || !content) return;
    await create({ ...createContext, ...createDraft, content }, { surface: true });
    setCreateContext(null); setCreateDraft(null);
  }, [create, createContext, createDraft]);
  const toggleSource = useCallback((work: WorkItem) => {
    setCollapsedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(work.id)) next.delete(work.id);
      else next.add(work.id);
      return next;
    });
  }, []);
  const openPlan = useCallback((planId: number) => {
    const resolved = collection?.plans.find((entry) => entry.plan.id === planId)?.plan ?? null;
    onOpenPlan(planId, resolved);
  }, [collection, onOpenPlan]);
  const sections = useMemo(() => plan?.kind === "okr" && plan.okrCycleId ? [
    periodScheduleMatrixSectionSpec({
      rootPlan: plan, works, collection, loading, canCreate, compact, savingKey, createRuntime,
      pendingCreate: createContext, createDraft, onCreateDraftChange: setCreateDraft,
      onConfirmCreate: confirmCreate, onCancelCreate: cancelCreate, onStartCreate: startCreate,
      onOpenPlan: openPlan, collapsedSourceIds, onToggleSource: toggleSource,
    }),
  ] : [], [
    canCreate, cancelCreate, collapsedSourceIds, collection, compact, confirmCreate,
    createContext, createDraft, createRuntime, loading, openPlan, plan, savingKey,
    startCreate, toggleSource, works,
  ]);
  return { viewModel: { sections }, status: { loading, saving: Boolean(savingKey) },
    commands: { reconcile: loadCollection, create, startCreate, cancelCreate } };
}
function defaultScheduleDisplayPeriodType(periodType: string | null | undefined): WorkOkrPeriodType | null {
  if (periodType === "yearly" || periodType === "half_year") return "quarterly";
  if (periodType === "quarterly") return "monthly";
  if (periodType === "monthly") return "weekly";
  return null;
}
function mergeCreatedItem(current: WorkPeriodCollectionResponse | null, created: WorkPeriodScheduleCreateResult): WorkPeriodCollectionResponse | null {
  if (!current) return current;
  const planEntry = { plan: created.plan, overlapCycleIds: created.planOverlapCycleIds };
  const itemEntry = { item: created.item, planId: created.planId, planTitle: created.plan.title,
    planCycleId: created.planCycleId, planCycleLabel: created.planCycleLabel, overlapCycleIds: created.overlapCycleIds };
  return {
    ...current,
    plans: current.plans.some((entry) => entry.plan.id === created.planId) ? current.plans : [...current.plans, planEntry],
    items: current.items.some((entry) => entry.item.id === created.workId)
      ? current.items.map((entry) => entry.item.id === created.workId ? itemEntry : entry)
      : [...current.items, itemEntry],
  };
}
