import type { ReactNode } from "react";
import type { DataSurfaceCellSpec } from "@workspace/core/ui";
import {
  type WorkflowFlowType,
  type WorkflowStatus,
} from "@workspace/platform/ui";

export type FinanceWorkflowFilterValue = "all" | "pending" | "active" | "done" | "attention";

export interface FinanceWorkflowStatusValue {
  status: WorkflowStatus;
  flowType?: WorkflowFlowType;
  label?: ReactNode;
  summary?: ReactNode;
}

export const FINANCE_WORKFLOW_FILTER_OPTIONS = [
  { value: "all", label: "全部流程" },
  { value: "pending", label: "待处理" },
  { value: "active", label: "处理中" },
  { value: "done", label: "已完成" },
  { value: "attention", label: "需关注" },
] as const satisfies readonly { value: FinanceWorkflowFilterValue; label: string }[];

const ATTENTION_STATUSES = new Set<WorkflowStatus>(["rejected", "failed", "withdrawn"]);
const DONE_STATUSES = new Set<WorkflowStatus>(["approved", "published"]);
const PENDING_STATUSES = new Set<WorkflowStatus>(["submitted"]);
const ACTIVE_STATUSES = new Set<WorkflowStatus>(["draft", "in_review"]);

export function financeWorkflowMatchesFilter(
  value: FinanceWorkflowStatusValue,
  filter: FinanceWorkflowFilterValue,
) {
  if (filter === "all") return true;
  if (filter === "pending") return PENDING_STATUSES.has(value.status);
  if (filter === "active") return ACTIVE_STATUSES.has(value.status);
  if (filter === "done") return DONE_STATUSES.has(value.status);
  return ATTENTION_STATUSES.has(value.status);
}

export function financeReviewRequestStatus(review: { status?: string | null; isStale?: boolean | null } | null | undefined): FinanceWorkflowStatusValue {
  if (!review) {
    return { status: "draft", flowType: "review", label: "未生成校对" };
  }
  if (review.status === "confirmed" && !review.isStale) {
    return { status: "approved", flowType: "review", label: "校对已确认" };
  }
  if (review.status === "confirmed" && review.isStale) {
    return { status: "submitted", flowType: "review", label: "校对待更新" };
  }
  return { status: "in_review", flowType: "review", label: "校对中" };
}

export function financeReviewLineStatus(status: string): FinanceWorkflowStatusValue {
  if (status === "flagged") return { status: "rejected", flowType: "review", label: "已标记" };
  if (status === "pending") return { status: "submitted", flowType: "review", label: "待确认" };
  if (status === "adjusted") return { status: "approved", flowType: "review", label: "已调整" };
  if (status === "confirmed") return { status: "approved", flowType: "review", label: "已确认" };
  return { status: "in_review", flowType: "review", label: status };
}

export function financeWorkflowStatusLabel(value: FinanceWorkflowStatusValue) {
  return typeof value.label === "string" ? value.label : value.status;
}

export function financeWorkflowStatusBadge(value: FinanceWorkflowStatusValue): DataSurfaceCellSpec {
  const tone = value.status === "approved" || value.status === "published"
    ? "green"
    : value.status === "submitted" || value.status === "in_review"
      ? "sky"
      : value.status === "rejected" || value.status === "failed"
        ? "red"
        : "slate";
  return { kind: "badge", label: financeWorkflowStatusLabel(value), tone };
}
