"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ImpactPlan, ImpactResolutionInput } from "@workspace/platform/mutation-impact-contract";
import { archiveWorkPlan, createWorkPlan, deleteWorkPlan, saveObjectivePlanSubmissionDraft, saveWorkPlanRevisionSubmissionDraft,
  submitWorkTaskSubmission, updateWorkPlan, WorkMutationImpactError } from "./api";
import { createEmptyWorkPlanDraft, createWorkPlanDraft, getWorkPlanKindLabel, isWorkPlanDraftDirty } from "./model";
import { planMatchesFutureFilter, type WorkPlanFutureFilter } from "./work-plan-future-filter";
import { planMatchesPeriodFilter, type WorkPlanPeriodFilter } from "./work-plan-period-filter";
import { matchesWorkPlanStatusFilter, type WorkStatusFilter } from "./work-status-filter";
import { useWorkPlanPagination } from "./useWorkPlanPagination";
import { targetNavigationKey } from "./WorkSpaceTopNavigation";
import { listReadableWorkPlans, nextSortOrder, sameTarget } from "./works-client-helpers";
import type { WorkPlan, WorkPlanDraft, WorkTarget, WorkTaskSpace } from "./types";
import type { WorkbenchChange } from "./useWorkSpaceSession";
type ConfirmDelete = (input: { title: string; message: string; confirmLabel: string }) => Promise<boolean>;
type WorkPlanWorkspaceInput = {
  activeTarget: WorkTarget | null; currentSpace: WorkTaskSpace | null; filteredSpaces: WorkTaskSpace[]; planLoadSpaces: WorkTaskSpace[];
  activeTab: string; onSummaryChange: (change: WorkbenchChange) => Promise<void>;
  onToast: (message: string, type: "success" | "error") => void; confirmDelete: ConfirmDelete;
};
export function useWorkPlanWorkspace({
  activeTarget, currentSpace, filteredSpaces, planLoadSpaces, activeTab, onSummaryChange, onToast, confirmDelete,
}: WorkPlanWorkspaceInput) {
  const [plans, setPlans] = useState<WorkPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [activeRoutineTaskId, setActiveRoutineTaskId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkPlanDraft>(() => createEmptyWorkPlanDraft());
  const [periodFilter, setPeriodFilter] = useState<WorkPlanPeriodFilter>("all");
  const [futureFilter, setFutureFilter] = useState<WorkPlanFutureFilter>("3m");
  const [statusFilter, setStatusFilter] = useState<WorkStatusFilter>("active");
  const activePlan = useMemo(() => plans.find((plan) => plan.id === activePlanId) ?? null, [activePlanId, plans]);
  const activeDraft = useMemo(() => activePlan ? createWorkPlanDraft(activePlan) : null, [activePlan]);
  const dirty = useMemo(() => isWorkPlanDraftDirty(activeDraft, draft), [activeDraft, draft]);
  const filteredPlans = useMemo(() => {
    const keys = new Set(filteredSpaces.map((space) => targetNavigationKey(space)));
    return plans.filter((plan) => keys.has(targetNavigationKey(plan)));
  }, [filteredSpaces, plans]);
  const navigationPlans = useMemo(() => filteredPlans
    .filter((plan) => planMatchesFutureFilter(plan, futureFilter))
    .filter((plan) => planMatchesPeriodFilter(plan, periodFilter))
    .filter((plan) => plan.kind === "routine"
      ? statusFilter === "active" || plan.id === activePlanId
      : matchesWorkPlanStatusFilter(plan, statusFilter)), [activePlanId, filteredPlans, futureFilter, periodFilter, statusFilter]);
  const kpiPlans = useMemo(
    () => filteredPlans.filter((plan) => plan.kind === "okr" && matchesWorkPlanStatusFilter(plan, statusFilter)),
    [filteredPlans, statusFilter],
  );
  const currentSpacePlans = useMemo(
    () => currentSpace ? plans.filter((plan) => sameTarget(plan, currentSpace)) : [],
    [currentSpace, plans],
  );
  const pagination = useWorkPlanPagination(activePlan, navigationPlans);
  const loadPlans = useCallback(async (options?: { isCancelled?: () => boolean }) => {
    if (planLoadSpaces.length === 0) {
      if (options?.isCancelled?.()) return;
      setPlans([]); setActivePlanId(null); setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { plans: nextPlans, error } = await listReadableWorkPlans(planLoadSpaces, activeTarget);
      if (options?.isCancelled?.()) return;
      if (error) throw error;
      setPlans(nextPlans);
      setActivePlanId((current) => preferredPlanId(nextPlans, current, activeTarget));
    } catch (error) {
      if (!options?.isCancelled?.()) onToast(error instanceof Error ? error.message : "加载工作计划失败", "error");
    } finally {
      if (!options?.isCancelled?.()) setLoading(false);
    }
  }, [activeTarget, onToast, planLoadSpaces]);
  useEffect(() => { let cancelled = false; void loadPlans({ isCancelled: () => cancelled }); return () => { cancelled = true; }; }, [loadPlans]);
  useEffect(() => {
    if (!activePlan || creating) return;
    setDraft(createWorkPlanDraft(activePlan));
  }, [activePlan, creating]);
  useEffect(() => { setEditing(false); }, [activePlanId]);
  useEffect(() => {
    if (activeTab !== "kpi" || loading) return;
    if (activePlan?.kind === "okr" && kpiPlans.some((plan) => plan.id === activePlan.id)) return;
    const preferred = kpiPlans.find((plan) => sameTarget(plan, activeTarget)) ?? kpiPlans[0] ?? null;
    setActivePlanId(preferred?.id ?? null);
  }, [activePlan, activeTab, activeTarget, kpiPlans, loading]);
  const reconcile = useCallback(async (_change: WorkbenchChange) => loadPlans(), [loadPlans]);
  const openPlan = useCallback((plan: WorkPlan, routineTaskId?: number | null) => {
    setActivePlanId(plan.id); setActiveRoutineTaskId(plan.kind === "routine" ? routineTaskId ?? null : null);
  }, []);
  const registerAndOpenPlan = useCallback((plan: WorkPlan) => {
    setPlans((current) => current.some((item) => item.id === plan.id) ? current : [...current, plan]);
    setActivePlanId(plan.id); setActiveRoutineTaskId(null);
  }, []);
  const beginCreate = useCallback(() => {
    setActivePlanId(null); setCreating(true); setEditing(false);
    setDraft(createEmptyWorkPlanDraft(nextSortOrder(currentSpacePlans)));
  }, [currentSpacePlans]);
  const cancelCreate = useCallback(() => {
    setCreating(false);
    setDraft(activePlan ? createWorkPlanDraft(activePlan) : createEmptyWorkPlanDraft());
  }, [activePlan]);
  const beginEdit = useCallback(() => {
    if (!activePlan) return;
    setDraft(createWorkPlanDraft(activePlan));
    setEditing(true);
  }, [activePlan]);
  const cancelEdit = useCallback(() => {
    setEditing(false);
    if (activePlan) setDraft(createWorkPlanDraft(activePlan));
  }, [activePlan]);
  async function createPlan(options?: { feedback?: boolean; rethrow?: boolean }) {
    if (!currentSpace || !draft.title.trim()) return;
    setSaving(true);
    try {
      const data = await createWorkPlan(currentSpace, draft);
      setCreating(false); setDraft(createEmptyWorkPlanDraft());
      await loadPlans();
      setActivePlanId(data.plan.id);
      if (options?.feedback !== false) onToast(`${getWorkPlanKindLabel(draft.kind)}已新建`, "success");
    } catch (error) {
      if (options?.feedback !== false) onToast(error instanceof Error ? error.message : `新建${getWorkPlanKindLabel(draft.kind)}失败`, "error");
      if (options?.rethrow) throw error;
    } finally {
      setSaving(false);
    }
  }
  async function savePlan() {
    if (!activePlan || !draft.title.trim()) return null;
    setSaving(true);
    try {
      const usesRevision = activePlan.governance
        ? activePlan.governance.facets.target.action?.kind === "objective_revise"
        : Boolean(activePlan.objectiveApprovedAt || activePlan.status === "done");
      if (!usesRevision) {
        const data = await updateWorkPlan(activePlan.id, draft);
        await Promise.all([onSummaryChange("plan.changed"), loadPlans()]);
        setActivePlanId(data.plan.id);
        onToast(`${getWorkPlanKindLabel(draft.kind)}已保存`, "success");
        return "committed" as const;
      }
      const created = await saveWorkPlanRevisionSubmissionDraft(activePlan, draft, activePlan.id);
      if (created.executionMode === "direct") {
        await Promise.all([onSummaryChange("plan.changed"), loadPlans()]);
        setActivePlanId(activePlan.id);
        onToast("工作计划已保存", "success");
        return "committed" as const;
      }
      const submitted = await submitWorkTaskSubmission(created.request.id, created.request.version);
      await Promise.all([onSummaryChange("plan.changed"), loadPlans()]);
      setActivePlanId(activePlan.id);
      onToast("工作计划修改已提交审核", "success");
      return submitted.request.status === "approved" ? "committed" as const : "submitted" as const;
    } catch (error) {
      onToast(error instanceof Error ? error.message : `保存${getWorkPlanKindLabel(draft.kind)}失败`, "error");
      return null;
    } finally {
      setSaving(false);
    }
  }
  async function submitObjectiveReview() {
    if (!activePlan) return;
    const label = activePlan.kind === "okr" ? "目标审查" : "工作包";
    setSaving(true);
    try {
      const created = await saveObjectivePlanSubmissionDraft(activePlan, activePlan);
      if (created.executionMode !== "direct") await submitWorkTaskSubmission(created.request.id, created.request.version);
      await Promise.all([onSummaryChange("plan.changed"), loadPlans()]);
      onToast(created.executionMode === "direct" ? `${label}已直接生效` : `${label}已提交`, "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : `提交${label}失败`, "error");
    } finally {
      setSaving(false);
    }
  }
  async function archivePlan() {
    if (!activePlan) return;
    const restoring = activePlan.isArchived;
    const confirmed = await confirmDelete({
      title: `${restoring ? "恢复" : "归档"}${getWorkPlanKindLabel(activePlan.kind)}`,
      message: `确定${restoring ? "恢复" : "归档"}「${activePlan.title}」吗？`,
      confirmLabel: restoring ? "恢复计划" : "归档计划",
    });
    if (!confirmed) return;
    try {
      const executed = await executeGovernedPlanMutation({
        execute: (resolution) => archiveWorkPlan(activePlan.id, resolution),
        confirmDelete,
        confirmLabel: restoring ? "恢复计划及关联项" : "归档计划及关联项",
      });
      if (!executed) return;
      setActivePlanId(null);
      await loadPlans();
      onToast(`${getWorkPlanKindLabel(activePlan.kind)}已${restoring ? "恢复" : "归档"}`, "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : `${restoring ? "恢复" : "归档"}${getWorkPlanKindLabel(activePlan.kind)}失败`, "error");
    }
  }
  async function removePlan() {
    if (!activePlan) return;
    const confirmed = await confirmDelete({
      title: `删除${getWorkPlanKindLabel(activePlan.kind)}`,
      message: `确定删除「${activePlan.title}」吗？计划内节点会一并删除，此操作不可恢复。`,
      confirmLabel: "删除计划",
    });
    if (!confirmed) return;
    try {
      const executed = await executeGovernedPlanMutation({
        execute: (resolution) => deleteWorkPlan(activePlan.id, resolution),
        confirmDelete,
        confirmLabel: "删除计划及关联项",
      });
      if (!executed) return;
      await Promise.all([onSummaryChange("plan.changed"), loadPlans()]);
      onToast(`${getWorkPlanKindLabel(activePlan.kind)}已删除`, "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : `删除${getWorkPlanKindLabel(activePlan.kind)}失败`, "error");
    }
  }
  return {
    catalog: { plans, filteredPlans, navigationPlans, kpiPlans, currentSpacePlans, pagination },
    selection: { activePlan, activePlanId, activeRoutineTaskId },
    editor: { draft, creating, editing, dirty, saving },
    filters: { periodFilter, futureFilter, statusFilter },
    status: { loading },
    commands: {
      openPlan, openPlanId: (planId: number) => setActivePlanId(planId), registerAndOpenPlan,
      clearSelection: () => setActivePlanId(null), setActiveRoutineTaskId, updateDraft: setDraft,
      beginCreate, cancelCreate, beginEdit, cancelEdit, finishEdit: () => setEditing(false),
      changePeriodFilter: setPeriodFilter, changeFutureFilter: setFutureFilter, changeStatusFilter: setStatusFilter,
      createPlan, savePlan, submitObjectiveReview, submitKrReview: async () => undefined,
      archivePlan, removePlan, reconcile,
    },
  };
}
function preferredPlanId(plans: WorkPlan[], current: number | null, target: WorkTarget | null) {
  if (current && plans.some((plan) => plan.id === current)) return current;
  const active = plans.find((plan) => sameTarget(plan, target) && !plan.isArchived);
  return active?.id ?? plans.find((plan) => sameTarget(plan, target))?.id ?? null;
}
async function executeGovernedPlanMutation(input: {
  execute: (resolution?: ImpactResolutionInput) => Promise<unknown>; confirmDelete: ConfirmDelete; confirmLabel: string;
}) {
  let resolution: ImpactResolutionInput | undefined;
  for (let confirmationRound = 0; confirmationRound < 3; confirmationRound += 1) {
    try {
      await input.execute(resolution);
      return true;
    } catch (error) {
      if (!(error instanceof WorkMutationImpactError)) throw error;
      const refreshedResolution = singleChoiceResolution(error.impact);
      if (!refreshedResolution) throw error;
      const confirmed = await input.confirmDelete({
        title: confirmationRound === 0 ? "确认关联影响" : "关联影响已变化，请再次确认",
        message: error.impact.confirmableEffects.map((group) => `${group.reason}（${group.count} 项）`).join("；"),
        confirmLabel: input.confirmLabel,
      });
      if (!confirmed) return false;
      resolution = refreshedResolution;
    }
  }
  throw new Error("关联影响持续变化，请刷新后重试");
}
function singleChoiceResolution(impact: ImpactPlan): ImpactResolutionInput | null {
  if (impact.blockers.length > 0 || impact.confirmableEffects.length === 0) return null;
  const resolutions = impact.confirmableEffects.map((group) => {
    const [resolution] = group.allowedResolutions;
    return group.allowedResolutions.length === 1 && resolution ? { relationKey: group.relationKey, resolution } : null;
  });
  if (resolutions.some((resolution) => !resolution)) return null;
  return { impactToken: impact.token, resolutions: resolutions.filter((choice) => choice !== null) };
}
