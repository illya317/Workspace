import type {
  ActionWorkflowHandlerSource,
  ActionWorkflowSeparationPolicy,
} from "./action-contract";
import type { WorkflowFlowType } from "./workflow-status";

export const APPROVAL_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "committing",
  "withdrawn",
  "rejected",
  "approved",
  "cancelled",
] as const;

export const APPROVAL_REQUEST_TRANSITIONS = [
  "submit",
  "withdraw",
  "cancel",
  "resubmit",
  "approve",
  "reject",
] as const;

export type ApprovalRequestStatus = typeof APPROVAL_REQUEST_STATUSES[number];
export type ApprovalRequestOperation = "create" | "update";
export type ApprovalRequestEventType =
  | "create_draft"
  | "submit"
  | "withdraw"
  | "revise"
  | "review_update"
  | "approve"
  | "review"
  | "publish"
  | "reject"
  | "cancel"
  | "comment"
  | "commit_failed";

const APPROVAL_REQUEST_EVENT_LABELS: Record<ApprovalRequestEventType, string> = {
  create_draft: "创建草稿",
  submit: "提交审批",
  withdraw: "撤回",
  revise: "修订",
  review_update: "审核修改",
  approve: "同意",
  review: "复核",
  publish: "发布",
  reject: "驳回",
  cancel: "删除请求",
  comment: "评论",
  commit_failed: "提交正式数据失败",
};

export type ApprovalRequestDescription = {
  title: string;
  summary: string;
  href: string;
};

export type ApprovalRequestEventViewDto<TPayload = unknown> = {
  id: number;
  sequence: number;
  eventType: ApprovalRequestEventType;
  actorUserId: number;
  actorName: string;
  workflowNodeKey: string | null;
  fromStatus: ApprovalRequestStatus | null;
  toStatus: ApprovalRequestStatus | null;
  comment: string | null;
  payloadSnapshot: TPayload | null;
  createdAt: string;
};

export type ApprovalRequestViewDto<TPayload = unknown> = {
  id: number;
  resourceKey: string;
  scopeId: string | null;
  businessActionKey: string;
  flowType: WorkflowFlowType;
  separationPolicy: ActionWorkflowSeparationPolicy;
  handlerSource: ActionWorkflowHandlerSource;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  sourceWorkflowPolicyId: number | null;
  sourceWorkflowPolicyVersion: number | null;
  sourceActionContractVersion: number | null;
  sourceOkrControlVersion: number | null;
  subjectType: string;
  subjectId: string | null;
  operation: ApprovalRequestOperation;
  status: ApprovalRequestStatus;
  latestPayload: TPayload;
  submitterUserId: number;
  submitterName: string;
  submittedAt: string | null;
  resolvedByUserId: number | null;
  resolvedAt: string | null;
  committedEntityType: string | null;
  committedEntityId: string | null;
  committedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  events: ApprovalRequestEventViewDto<TPayload>[];
  canProcess?: boolean;
  description?: ApprovalRequestDescription;
};

const APPROVAL_REQUEST_STATUS_SET = new Set<string>(APPROVAL_REQUEST_STATUSES);

export function isApprovalRequestStatus(value: unknown): value is ApprovalRequestStatus {
  return typeof value === "string" && APPROVAL_REQUEST_STATUS_SET.has(value);
}

export function getApprovalRequestEventLabel(eventType: string) {
  return APPROVAL_REQUEST_EVENT_LABELS[eventType as ApprovalRequestEventType] ?? eventType;
}

export function parseApprovalRequestStatusList(value: string | null | undefined) {
  if (!value) return undefined;
  const statuses = value
    .split(",")
    .map((item) => item.trim())
    .filter(isApprovalRequestStatus);
  return statuses.length > 0 ? statuses : undefined;
}
