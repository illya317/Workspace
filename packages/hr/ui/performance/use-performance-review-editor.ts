"use client";

import { useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { useFeedback, type FormSurfaceActionSpec } from "@workspace/core/ui";
import type { ActionRuntimeAction } from "@workspace/platform";
import { actionRuntimeCommands, workflowActionSurfaceActions } from "@workspace/platform/ui";
import {
  performanceReviewPayload,
  reviewDraftFromSubmission,
} from "./performance-review-editor-model";
import type {
  DashboardData,
  ReviewDraft,
  ReviewEditorStage,
  SubmissionAction,
  SubmissionRow,
} from "./performance-types";

type ReviewEditorMode = "closed" | "create" | "edit";
type EditorAction = Extract<
  ActionRuntimeAction,
  | "workflow.request.submit"
  | "workflow.request.revise"
  | "workflow.request.resubmit"
  | "workflow.request.approve"
  | "workflow.request.reject"
>;

type SubmissionMutationResponse = {
  request: {
    id: number;
    version: number;
  };
};

export const EMPTY_REVIEW_DRAFT: ReviewDraft = {
  selfScore: "",
  selfComment: "",
  managerScore: "",
  managerComment: "",
  finalScore: "",
  finalGrade: "",
  hrComment: "",
  comment: "",
};

export function usePerformanceReviewEditor(input: {
  data: DashboardData | null;
  selectedCycleId: number;
  reload: () => Promise<void>;
}) {
  const [mode, setMode] = useState<ReviewEditorMode>("closed");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ReviewDraft>(EMPTY_REVIEW_DRAFT);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback();
  const selectedSubmission = useMemo(
    () => input.data?.submissionRows.find((row) => row.id === selectedSubmissionId) ?? null,
    [input.data?.submissionRows, selectedSubmissionId],
  );
  const runtime = mode === "create"
    ? input.data?.createRuntime ?? null
    : mode === "edit"
      ? selectedSubmission?.actionRuntime ?? null
      : null;
  const canCreateSelfReview = Boolean(
    input.data?.currentEmployee
    && input.selectedCycleId
    && input.data.createRuntime.actions.includes("workflow.request.submit"),
  );
  const showCreateSelfReview = input.data?.createRuntime.actions.includes("workflow.request.submit") === true;
  const editorOpen = mode !== "closed";
  const editorStage: ReviewEditorStage = !editorOpen
    ? "none"
    : mode === "create" || selectedSubmission?.status !== "submitted"
      ? "self"
      : selectedSubmission.actionRuntime.workflowRole === "processor"
        ? selectedSubmission.activeWorkflowNodeKey === "hr-final-review" ? "hr" : "manager"
        : "none";

  function beginCreate() {
    if (!canCreateSelfReview) return;
    setSelectedSubmissionId(null);
    setDraft(EMPTY_REVIEW_DRAFT);
    setMode("create");
  }

  function beginEdit(id: number) {
    const row = input.data?.submissionRows.find((candidate) => candidate.id === id);
    if (!row || row.actionRuntime.editability !== "editable") return;
    setSelectedSubmissionId(row.id);
    setDraft(reviewDraftFromSubmission(row));
    setMode("edit");
  }

  function closeEditor() {
    setMode("closed");
    setSelectedSubmissionId(null);
    setDraft(EMPTY_REVIEW_DRAFT);
  }

  async function runEditorAction(action: EditorAction) {
    if (!runtime?.actions.includes(action)) return;
    setSaving(true);
    try {
      if (action === "workflow.request.submit") {
        if (mode === "create") await createAndSubmit();
        else await updateAndTransition("submit", "提交");
      } else if (action === "workflow.request.revise") {
        await updateOnly();
      } else if (action === "workflow.request.resubmit") {
        await updateAndTransition("submit", "再次提交");
      } else if (action === "workflow.request.approve") {
        await updateAndTransition("approve", "通过");
      } else {
        if (!selectedSubmission) return;
        await transition(selectedSubmission, "reject");
      }
      feedback.success(editorActionSuccess(action));
      closeEditor();
      await input.reload();
    } catch (error) {
      feedback.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function runRowAction(row: SubmissionRow, action: SubmissionAction) {
    const runtimeAction = rowRuntimeAction(action);
    const allowed = action === "cancel"
      ? row.actionRuntime.capabilities.workflowRequest.cancel.allowed
      : runtimeAction !== null && row.actionRuntime.actions.includes(runtimeAction);
    if (!allowed) return;
    setSaving(true);
    try {
      await transition(row, action === "resubmit" ? "submit" : action);
      feedback.success(rowActionSuccess(action));
      if (selectedSubmissionId === row.id) closeEditor();
      await input.reload();
    } catch (error) {
      feedback.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function createAndSubmit() {
    if (!input.data?.currentEmployee || !input.selectedCycleId) return;
    const created = await mutate("/api/modules/hr/performance/submissions", {
      employeeId: input.data.currentEmployee.id,
      okrCycleId: input.selectedCycleId,
      payload: performanceReviewPayload(draft),
      comment: draft.comment || null,
    });
    try {
      await transition(created.request, "submit");
    } catch (error) {
      setSelectedSubmissionId(created.request.id);
      setMode("edit");
      await input.reload();
      throw new Error(`流程草稿已创建，但提交失败：${errorMessage(error)}`);
    }
  }

  async function updateAndTransition(action: "submit" | "approve", label: string) {
    if (!selectedSubmission) return;
    const updated = await mutate(`/api/modules/hr/performance/submissions/${selectedSubmission.id}`, {
      payload: performanceReviewPayload(draft),
      comment: draft.comment || null,
      version: selectedSubmission.version,
    }, "PUT");
    try {
      await transition(updated.request, action);
    } catch (error) {
      await input.reload();
      throw new Error(`评分内容已保存，但${label}失败：${errorMessage(error)}`);
    }
  }

  async function updateOnly() {
    if (!selectedSubmission) return;
    await mutate(`/api/modules/hr/performance/submissions/${selectedSubmission.id}`, {
      payload: performanceReviewPayload(draft),
      comment: draft.comment || null,
      version: selectedSubmission.version,
    }, "PUT");
  }

  async function transition(
    request: SubmissionMutationResponse["request"],
    action: "submit" | "withdraw" | "cancel" | "approve" | "reject",
  ) {
    return mutate(`/api/modules/hr/performance/submissions/${request.id}/${action}`, {
      comment: draft.comment || null,
      version: request.version,
    });
  }

  const runtimeActions = workflowActionSurfaceActions(actionRuntimeCommands(runtime, {
    "workflow.request.submit": {
      disabled: saving,
      onClick: () => void runEditorAction("workflow.request.submit"),
    },
    "workflow.request.resubmit": {
      disabled: saving,
      onClick: () => void runEditorAction("workflow.request.resubmit"),
    },
    "workflow.request.revise": runtime?.actions.includes("workflow.request.resubmit")
      ? undefined
      : {
          label: "保存",
          disabled: saving,
          onClick: () => void runEditorAction("workflow.request.revise"),
        },
    "workflow.request.approve": {
      label: "通过",
      disabled: saving,
      onClick: () => void runEditorAction("workflow.request.approve"),
    },
    "workflow.request.reject": {
      label: "驳回",
      disabled: saving,
      onClick: () => void runEditorAction("workflow.request.reject"),
    },
    "form.cancel": {
      disabled: saving,
      onClick: closeEditor,
    },
  }));
  const editorActions: FormSurfaceActionSpec[] = editorOpen && !runtimeActions.some((action) => action.action === "cancel")
    ? [...runtimeActions, { key: "editor.cancel", action: "cancel", disabled: saving, onClick: closeEditor }]
    : runtimeActions;

  return {
    beginCreate,
    beginEdit,
    canCreateSelfReview,
    draft,
    editorActions,
    editorFieldsDisabled: !editorOpen || runtime?.editability !== "editable" || saving,
    editorOpen,
    editorStage,
    runRowAction,
    saving,
    selectedSubmissionId,
    setDraft,
    showCreateSelfReview,
  };
}

async function mutate(path: string, body: Record<string, unknown>, method = "POST") {
  const response = await fetch(workspacePath(path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<SubmissionMutationResponse>;
}

function editorActionSuccess(action: EditorAction) {
  if (action === "workflow.request.revise") return "绩效评分已保存";
  if (action === "workflow.request.approve") return "绩效评审已通过";
  if (action === "workflow.request.reject") return "绩效评审已驳回";
  if (action === "workflow.request.resubmit") return "绩效评审已再次提交";
  return "绩效评审已提交";
}

function rowRuntimeAction(action: SubmissionAction): ActionRuntimeAction | null {
  if (action === "submit") return "workflow.request.submit";
  if (action === "resubmit") return "workflow.request.resubmit";
  if (action === "withdraw") return "workflow.request.withdraw";
  if (action === "approve") return "workflow.request.approve";
  if (action === "reject") return "workflow.request.reject";
  return null;
}

function rowActionSuccess(action: SubmissionAction) {
  if (action === "submit") return "绩效评审已提交";
  if (action === "resubmit") return "绩效评审已再次提交";
  if (action === "withdraw") return "绩效评审已撤回";
  if (action === "approve") return "绩效评审已通过";
  if (action === "reject") return "绩效评审已驳回";
  return "绩效评审申请已取消";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "绩效评审操作失败";
}

async function readError(response: Response) {
  const fallback = `请求失败 (${response.status})`;
  try {
    const json = await response.json();
    return String(json.error || json.message || fallback);
  } catch {
    return fallback;
  }
}
