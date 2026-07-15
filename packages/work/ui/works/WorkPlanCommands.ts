import type { Dispatch, SetStateAction } from "react";
import {
  archiveWorkPlan,
  createWorkPlan,
  deleteWorkPlan,
  saveObjectivePlanSubmissionDraft,
  saveWorkPlanRevisionSubmissionDraft,
  saveWorkPlanSubmissionDraft,
  submitWorkTaskSubmission,
  updateWorkPlanKrReviewOpenDate,
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

  async function handleUpdatePlan() {
    if (!activePlan || !planDraft.title.trim()) return;
    setPlanSaving(true);
    try {
      const data = await updateWorkPlan(activePlan.id, planDraft);
      await loadPlans();
      setActivePlanId(data.plan.id);
      showToast(`${getWorkPlanKindLabel(planDraft.kind)}已保存`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : `保存${getWorkPlanKindLabel(planDraft.kind)}失败`, "error");
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleReviseCompletedPlan() {
    if (!activePlan || activePlan.status !== "done" || activePlan.isArchived) return;
    setPlanSaving(true);
    try {
      await updateWorkPlan(activePlan.id, { ...planDraft, status: "active", actualEndDate: null });
      await Promise.all([loadSpaces(), loadPlans()]);
      setActivePlanId(activePlan.id);
      showToast("工作计划已进入修订", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "修订工作计划失败", "error");
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleSubmitCreatePlan(options?: { feedback?: boolean; rethrow?: boolean }) {
    if (!currentSpace || !planDraft.title.trim()) return;
    setPlanSaving(true);
    try {
      const created = await saveWorkPlanSubmissionDraft(currentSpace, "create", planDraft);
      if (created.executionMode === "direct") {
        setPlanCreating(false);
        setPlanDraft(createEmptyWorkPlanDraft());
        await loadPlans();
        const planId = Number(created.result.entityId);
        if (Number.isInteger(planId) && planId > 0) setActivePlanId(planId);
        if (options?.feedback !== false) showToast("目标计划已直接生效", "success");
        return;
      }
      const submitted = await submitWorkTaskSubmission(created.request.id, created.request.version);
      setPlanCreating(false);
      setPlanDraft(createEmptyWorkPlanDraft());
      await Promise.all([loadSpaces(), loadPlans()]);
      const committedPlanId = Number(submitted.request.committedEntityId);
      if (Number.isInteger(committedPlanId) && committedPlanId > 0) setActivePlanId(committedPlanId);
      if (options?.feedback !== false) showToast("目标计划已提交审核", "success");
    } catch (err) {
      if (options?.feedback !== false) showToast(err instanceof Error ? err.message : "提交目标计划失败", "error");
      if (options?.rethrow) throw err;
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleSubmitUpdatePlan() {
    if (!activePlan || !planDraft.title.trim()) return;
    setPlanSaving(true);
    try {
      const created = await saveWorkPlanSubmissionDraft(activePlan, "update", planDraft, activePlan.id);
      if (created.executionMode === "direct") {
        await Promise.all([loadSpaces(), loadPlans()]);
        setActivePlanId(activePlan.id);
        showToast("目标计划修改已直接生效", "success");
        return;
      }
      const submitted = await submitWorkTaskSubmission(created.request.id, created.request.version);
      await Promise.all([loadSpaces(), loadPlans()]);
      const committedPlanId = Number(submitted.request.committedEntityId || activePlan.id);
      if (Number.isInteger(committedPlanId) && committedPlanId > 0) setActivePlanId(committedPlanId);
      showToast("目标计划修改已提交审核", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "提交目标计划修改失败", "error");
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleSubmitPlanRevision() {
    if (!activePlan || !planDraft.title.trim()) return;
    setPlanSaving(true);
    try {
      const revisionDraft = activePlan.status === "done"
        ? { ...planDraft, status: "active" as const, actualEndDate: null }
        : planDraft;
      const created = await saveWorkPlanRevisionSubmissionDraft(activePlan, revisionDraft, activePlan.id);
      if (created.executionMode === "direct") {
        await Promise.all([loadSpaces(), loadPlans()]);
        setActivePlanId(activePlan.id);
        showToast("工作计划修订已直接生效", "success");
        return;
      }
      await submitWorkTaskSubmission(created.request.id, created.request.version);
      await Promise.all([loadSpaces(), loadPlans()]);
      setActivePlanId(activePlan.id);
      showToast("工作计划修订已提交审核", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "提交工作计划修订失败", "error");
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

  async function handleAdjustKrReviewOpenDate(krReviewOpensAt: string) {
    if (!activePlan) return false;
    setPlanSaving(true);
    try {
      const data = await updateWorkPlanKrReviewOpenDate(activePlan.id, krReviewOpensAt);
      await Promise.all([loadSpaces(), loadPlans()]);
      setActivePlanId(data.plan.id);
      showToast("KR 开放日期已调整", "success");
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "调整 KR 开放日期失败", "error");
      return false;
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleOpenKrReviewNow() {
    const today = new Date().toISOString().slice(0, 10);
    return handleAdjustKrReviewOpenDate(today);
  }

  async function handleLockKrReview() {
    const lockDate = nextKrLockDate(activePlan);
    return handleAdjustKrReviewOpenDate(lockDate);
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
    handleSubmitCreatePlan,
    handleSubmitKrReview: async () => undefined,
    handleSubmitObjectiveReview,
    handleSubmitPlanRevision,
    handleSubmitUpdatePlan,
    handleAdjustKrReviewOpenDate,
    handleLockKrReview,
    handleOpenKrReviewNow,
    handleReviseCompletedPlan,
    handleUpdatePlan,
  };
}

function nextKrLockDate(plan: WorkPlan | null) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const actualEndDate = plan?.actualEndDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  return actualEndDate > today ? actualEndDate : tomorrow;
}
