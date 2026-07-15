import type { Dispatch, SetStateAction } from "react";
import {
  archiveWorkPlan,
  createWorkPlan,
  deleteWorkPlan,
  saveObjectivePlanSubmissionDraft,
  saveWorkPlanRevisionSubmissionDraft,
  submitWorkTaskSubmission,
  updateWorkPlan,
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
      const saveDraft = activePlan.status === "done"
        ? { ...planDraft, status: "active" as const, actualEndDate: null }
        : planDraft;
      if (!activePlan.objectiveApprovedAt && activePlan.status !== "done") {
        const data = await updateWorkPlan(activePlan.id, saveDraft);
        await Promise.all([loadSpaces(), loadPlans()]);
        setActivePlanId(data.plan.id);
        showToast(`${getWorkPlanKindLabel(planDraft.kind)}已保存`, "success");
        return "committed" as const;
      }
      const created = await saveWorkPlanRevisionSubmissionDraft(activePlan, saveDraft, activePlan.id);
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
        : `确定归档「${activePlan.title}」吗？计划内节点会保留但默认不再显示。`,
      confirmLabel: restoring ? "恢复计划" : "归档计划",
    });
    if (!ok) return;
    try {
      await archiveWorkPlan(activePlan.id);
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
      await deleteWorkPlan(activePlan.id);
      await Promise.all([loadSpaces(), loadPlans()]);
      showToast(`${getWorkPlanKindLabel(activePlan.kind)}已删除`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : `删除${getWorkPlanKindLabel(activePlan.kind)}失败`, "error");
    }
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
