import type { DataSurfaceCellSpec } from "@workspace/core/ui";
import type { ReviewDraft, SubmissionAction, SubmissionRow } from "./performance-types";

export function reviewDraftFromSubmission(row: SubmissionRow): ReviewDraft {
  return {
    selfScore: scoreText(row.selfScore),
    selfComment: row.selfComment,
    managerScore: scoreText(row.managerScore),
    managerComment: row.managerComment,
    finalScore: scoreText(row.finalScore),
    finalGrade: row.finalGrade,
    hrComment: row.hrComment,
    comment: "",
  };
}

export function performanceReviewPayload(draft: ReviewDraft) {
  return {
    selfScore: scoreValue(draft.selfScore),
    selfComment: draft.selfComment,
    managerScore: scoreValue(draft.managerScore),
    managerComment: draft.managerComment,
    finalScore: scoreValue(draft.finalScore),
    finalGrade: draft.finalGrade,
    hrComment: draft.hrComment,
  };
}

export function performanceSubmissionRowActions(input: {
  row: SubmissionRow;
  selectedId: number | null;
  saving: boolean;
  onEdit: (id: number) => void;
  onAction: (row: SubmissionRow, action: SubmissionAction) => void;
}): Extract<DataSurfaceCellSpec, { kind: "actions" }>["actions"] {
  const { row } = input;
  const editable = row.actionRuntime.editability === "editable";
  return [
    ...(editable
      ? [{
          key: "edit",
          label: input.selectedId === row.id ? "编辑中" : "编辑",
          icon: "edit" as const,
          disabled: input.saving,
          onClick: () => input.onEdit(row.id),
        }]
      : []),
    ...(!editable && row.actionRuntime.actions.includes("workflow.request.submit")
      ? [{
          key: "submit",
          label: "提交",
          icon: "send" as const,
          disabled: input.saving,
          onClick: () => input.onAction(row, "submit"),
        }]
      : []),
    ...(!editable && row.actionRuntime.actions.includes("workflow.request.resubmit")
      ? [{
          key: "resubmit",
          label: "再次提交",
          icon: "send" as const,
          disabled: input.saving,
          onClick: () => input.onAction(row, "resubmit"),
        }]
      : []),
    ...(!editable && row.actionRuntime.actions.includes("workflow.request.approve")
      ? [{
          key: "approve",
          label: "通过",
          icon: "approve" as const,
          disabled: input.saving,
          onClick: () => input.onAction(row, "approve"),
        }]
      : []),
    ...(!editable && row.actionRuntime.actions.includes("workflow.request.reject")
      ? [{
          key: "reject",
          label: "驳回",
          icon: "reject" as const,
          disabled: input.saving,
          onClick: () => input.onAction(row, "reject"),
        }]
      : []),
    ...(row.actionRuntime.actions.includes("workflow.request.withdraw")
      ? [{
          key: "withdraw",
          label: "撤回",
          icon: "withdraw" as const,
          disabled: input.saving,
          onClick: () => input.onAction(row, "withdraw"),
        }]
      : []),
    ...(row.actionRuntime.capabilities.workflowRequest.cancel.allowed
      ? [{
          key: "cancel-request",
          label: "取消申请",
          icon: "cancel" as const,
          disabled: input.saving,
          onClick: () => input.onAction(row, "cancel"),
        }]
      : []),
  ];
}

function scoreText(value: number | null) {
  return value === null ? "" : String(value);
}

export function scoreValue(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
