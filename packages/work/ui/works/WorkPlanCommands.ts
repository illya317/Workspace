import type { Dispatch, SetStateAction } from "react";
import type { ImpactPlan, ImpactResolutionInput } from "@workspace/platform/mutation-impact-contract";
import {
  archiveWorkPlan,
  createWorkPlan,
  deleteWorkPlan,
  saveObjectivePlanSubmissionDraft,
  saveWorkPlanRevisionSubmissionDraft,
  submitWorkTaskSubmission,
  updateWorkPlan,
  WorkMutationImpactError,
} from "./api";
import { createEmptyWorkPlanDraft, getWorkPlanKindLabel } from "./model";
import type { WorkPlan, WorkPlanDraft, WorkTarget } from "./types";

interface ConfirmDeleteInput {
  title: string;
  message: string;
  confirmLabel: string;
}

interface WorkPlanCommandInput {
  currentSpace: WorkTarget | null;
  activePlan: WorkPlan | null;
  planDraft: WorkPlanDraft;
  setPlanSaving: Dispatch<SetStateAction<boolean>>;
  setPlanCreating: Dispatch<SetStateAction<boolean>>;
  setPlanDraft: Dispatch<SetStateAction<WorkPlanDraft>>;
  setActivePlanId: Dispatch<SetStateAction<number | null>>;
  loadSpaces: () => Promise<void>;
  loadPlans: () => Promise<void>;
  showToast: (message: string, type: "success" | "error") => void;
  confirmDelete: (input: ConfirmDeleteInput) => Promise<boolean>;
}

export function useWorkPlanCommands({
  currentSpace,
  activePlan,
  planDraft,
  setPlanSaving,
  setPlanCreating,
  setPlanDraft,
  setActivePlanId,
  loadSpaces,
  loadPlans,
  showToast,
  confirmDelete,
}: WorkPlanCommandInput) {
  async function handleCreatePlan(options?: { feedback?: boolean; rethrow?: boolean }) {
    if (!currentSpace || !planDraft.title.trim()) return;
    setPlanSaving(true);
    try {
      const data = await createWorkPlan(currentSpace, planDraft);
      setPlanCreating(false);
      setPlanDraft(createEmptyWorkPlanDraft());
      await loadPlans();
      setActivePlanId(data.plan.id);
      if (options?.feedback !== false) showToast(`${getWorkPlanKindLabel(planDraft.kind)}已新建`, "success");
    } catch (err) {
      if (options?.feedback !== false) showToast(err instanceof Error ? err.message : `新建${getWorkPlanKindLabel(planDraft.kind)}失败`, "error");
      if (options?.rethrow) throw err;
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleSavePlan() {
    if (!activePlan || !planDraft.title.trim()) return null;
    setPlanSaving(true);
    try {
      const usesObjectiveRevision = activePlan.governance
        ? activePlan.governance.facets.target.action?.kind === "objective_revise"
        : Boolean(activePlan.objectiveApprovedAt || activePlan.status === "done");
      if (!usesObjectiveRevision) {
        const data = await updateWorkPlan(activePlan.id, planDraft);
        await Promise.all([loadSpaces(), loadPlans()]);
        setActivePlanId(data.plan.id);
        showToast(`${getWorkPlanKindLabel(planDraft.kind)}已保存`, "success");
        return "committed" as const;
      }
      const created = await saveWorkPlanRevisionSubmissionDraft(activePlan, planDraft, activePlan.id);
      if (created.executionMode === "direct") {
        await Promise.all([loadSpaces(), loadPlans()]);
        setActivePlanId(activePlan.id);
        showToast("工作计划已保存", "success");
        return "committed" as const;
      }
      const submitted = await submitWorkTaskSubmission(created.request.id, created.request.version);
      await Promise.all([loadSpaces(), loadPlans()]);
      setActivePlanId(activePlan.id);
      showToast("工作计划修改已提交审核", "success");
      return submitted.request.status === "approved" ? "committed" as const : "submitted" as const;
    } catch (err) {
      showToast(err instanceof Error ? err.message : `保存${getWorkPlanKindLabel(planDraft.kind)}失败`, "error");
      return null;
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleSubmitObjectiveReview() {
    if (!activePlan) return;
    const packageLabel = activePlan.kind === "okr" ? "目标审查" : "工作包";
    setPlanSaving(true);
    try {
      const created = await saveObjectivePlanSubmissionDraft(activePlan, activePlan);
      if (created.executionMode === "direct") {
        await Promise.all([loadSpaces(), loadPlans()]);
        showToast(`${packageLabel}已直接生效`, "success");
        return;
      }
      await submitWorkTaskSubmission(created.request.id, created.request.version);
      await Promise.all([loadSpaces(), loadPlans()]);
      showToast(`${packageLabel}已提交`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : `提交${packageLabel}失败`, "error");
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleArchivePlan() {
    if (!activePlan) return;
    const restoring = activePlan.isArchived;
    const ok = await confirmDelete({
      title: `${restoring ? "恢复" : "归档"}${getWorkPlanKindLabel(activePlan.kind)}`,
      message: restoring
        ? `确定恢复「${activePlan.title}」吗？`
        : `确定归档「${activePlan.title}」吗？`,
      confirmLabel: restoring ? "恢复计划" : "归档计划",
    });
    if (!ok) return;
    try {
      const executed = await executeGovernedPlanMutation({
        execute: (resolution) => archiveWorkPlan(activePlan.id, resolution),
        confirmDelete,
        confirmLabel: restoring ? "恢复计划及关联项" : "归档计划及关联项",
      });
      if (!executed) return;
      setActivePlanId(null);
      await loadPlans();
      showToast(`${getWorkPlanKindLabel(activePlan.kind)}已${restoring ? "恢复" : "归档"}`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : `${restoring ? "恢复" : "归档"}${getWorkPlanKindLabel(activePlan.kind)}失败`, "error");
    }
  }

  async function handleDeletePlan() {
    if (!activePlan) return;
    const ok = await confirmDelete({
      title: `删除${getWorkPlanKindLabel(activePlan.kind)}`,
      message: `确定删除「${activePlan.title}」吗？计划内节点会一并删除，此操作不可恢复。`,
      confirmLabel: "删除计划",
    });
    if (!ok) return;
    try {
      const executed = await executeGovernedPlanMutation({
        execute: (resolution) => deleteWorkPlan(activePlan.id, resolution),
        confirmDelete,
        confirmLabel: "删除计划及关联项",
      });
      if (!executed) return;
      await Promise.all([loadSpaces(), loadPlans()]);
      showToast(`${getWorkPlanKindLabel(activePlan.kind)}已删除`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : `删除${getWorkPlanKindLabel(activePlan.kind)}失败`, "error");
    }
  }

  async function executeGovernedPlanMutation(input: {
    execute: (resolution?: ImpactResolutionInput) => Promise<unknown>;
    confirmDelete: WorkPlanCommandInput["confirmDelete"];
    confirmLabel: string;
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
          message: impactConfirmationMessage(error.impact),
          confirmLabel: input.confirmLabel,
        });
        if (!confirmed) return false;
        resolution = refreshedResolution;
      }
    }
    throw new Error("关联影响持续变化，请刷新后重试");
  }

  return {
    handleArchivePlan,
    handleCreatePlan,
    handleDeletePlan,
    handleSubmitKrReview: async () => undefined,
    handleSubmitObjectiveReview,
    handleSavePlan,
  };
}

function singleChoiceResolution(impact: ImpactPlan): ImpactResolutionInput | null {
  if (impact.blockers.length > 0 || impact.confirmableEffects.length === 0) return null;
  const resolutions = impact.confirmableEffects.map((group) => {
    const [resolution] = group.allowedResolutions;
    return group.allowedResolutions.length === 1 && resolution
      ? { relationKey: group.relationKey, resolution }
      : null;
  });
  if (resolutions.some((resolution) => !resolution)) return null;
  return { impactToken: impact.token, resolutions: resolutions.filter((choice) => choice !== null) };
}

function impactConfirmationMessage(impact: ImpactPlan) {
  const groups = impact.confirmableEffects.map((group) => `${group.reason}（${group.count} 项）`);
  return groups.join("；");
}
