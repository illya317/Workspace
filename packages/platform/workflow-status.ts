export type WorkflowFlowType = "approval" | "review" | "publish";
export type WorkflowStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "rejected"
  | "withdrawn"
  | "approved"
  | "published"
  | "cancelled"
  | "failed";

export type WorkflowStatusTone = "default" | "success" | "warning" | "danger" | "muted";

const FLOW_TYPE_LABEL: Record<WorkflowFlowType, string> = {
  approval: "审批",
  review: "复核",
  publish: "发布",
};

const STATUS_LABELS: Record<WorkflowStatus, Record<WorkflowFlowType, string>> = {
  draft: { approval: "草稿", review: "草稿", publish: "草稿" },
  submitted: { approval: "待审批", review: "待复核", publish: "待发布审核" },
  in_review: { approval: "审批中", review: "复核中", publish: "发布审核中" },
  rejected: { approval: "已驳回", review: "复核驳回", publish: "发布驳回" },
  withdrawn: { approval: "已撤回", review: "已撤回", publish: "已撤回" },
  approved: { approval: "已通过", review: "已复核", publish: "已通过" },
  published: { approval: "已归档", review: "已归档", publish: "已发布" },
  cancelled: { approval: "已取消", review: "已取消", publish: "已取消" },
  failed: { approval: "提交失败", review: "复核失败", publish: "发布失败" },
};

export function parseWorkflowStatus(status: unknown): WorkflowStatus | null {
  if (status === "committing") return "in_review";
  if (status === "draft" || status === "submitted" || status === "in_review" || status === "rejected"
    || status === "withdrawn" || status === "approved" || status === "published"
    || status === "cancelled" || status === "failed") return status;
  return null;
}

export function normalizeWorkflowStatus(status: string): WorkflowStatus {
  return parseWorkflowStatus(status) ?? "failed";
}

export function getWorkflowFlowTypeLabel(flowType: WorkflowFlowType = "approval") {
  return FLOW_TYPE_LABEL[flowType];
}

export function getWorkflowStatusLabel(status: string, flowType: WorkflowFlowType = "approval") {
  return STATUS_LABELS[normalizeWorkflowStatus(status)][flowType];
}

export function getWorkflowStatusTone(status: string): WorkflowStatusTone {
  const normalized = normalizeWorkflowStatus(status);
  if (normalized === "approved" || normalized === "published") return "success";
  if (normalized === "submitted" || normalized === "in_review") return "warning";
  if (normalized === "rejected" || normalized === "failed") return "danger";
  if (normalized === "withdrawn" || normalized === "cancelled") return "muted";
  return "default";
}

export function getWorkflowStatusView(status: string, flowType: WorkflowFlowType = "approval") {
  const normalized = normalizeWorkflowStatus(status);
  return {
    status: normalized,
    label: getWorkflowStatusLabel(normalized, flowType),
    tone: getWorkflowStatusTone(normalized),
  };
}
