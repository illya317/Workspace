import type { ServiceResult } from "../api";
import type {
  WorkflowFlowType,
  WorkflowHandlerSource,
  WorkflowPolicyNodeDefinition,
  WorkflowPolicyDefaults,
  WorkflowPolicyMode,
  WorkflowSeparationPolicy,
} from "../workflows";

export type ApprovalStatus = "draft" | "submitted" | "committing" | "withdrawn" | "rejected" | "approved" | "cancelled";
export type ApprovalOperation = "create" | "update";
export type ApprovalEventType =
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

export type ApprovalFlowType = WorkflowFlowType;
export type ApprovalSeparationPolicy = WorkflowSeparationPolicy;
export type ApprovalWorkflowPolicyMode = WorkflowPolicyMode;
export type ApprovalHandlerSource = WorkflowHandlerSource;
export type ApprovalWorkflowJoinState = Record<string, string[]>;

export type ApprovalAccessAction =
  | "listRequests"
  | "createDraft"
  | "comment"
  | "reviewUpdate"
  | "approve"
  | "reject";

export type ApprovalPreparedPayload<TPayload> = {
  resourceKey: string;
  scopeId?: string | null;
  subjectId?: string | null;
  payload: TPayload;
  businessActionKey?: string | null;
  flowType?: ApprovalFlowType | string | null;
  separationPolicy?: ApprovalSeparationPolicy | string | null;
  workflowScopeType?: string | null;
  workflowMode?: ApprovalWorkflowPolicyMode | string | null;
  workflowHandlerSource?: string | null;
  workflowHandlerCanRevise?: boolean | null;
  workflowRequestCanWithdraw?: boolean | null;
  workflowRequestCanResubmit?: boolean | null;
  workflowRequestCanCancel?: boolean | null;
  workflowRequestCanRevise?: boolean | null;
};

export type ApprovalRequestRecord<TPayload> = {
  id: number;
  resourceKey: string;
  scopeId: string | null;
  businessActionKey: string;
  flowType: ApprovalFlowType;
  separationPolicy: ApprovalSeparationPolicy;
  handlerSource: ApprovalHandlerSource;
  workflowNodes: WorkflowPolicyNodeDefinition[];
  activeWorkflowNodeKey: string | null;
  activeWorkflowNodeKeys: string[];
  workflowJoinState: ApprovalWorkflowJoinState;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  subjectType: string;
  subjectId: string | null;
  operation: ApprovalOperation;
  status: ApprovalStatus;
  latestPayload: TPayload;
  submitterUserId: number;
  submittedAt: Date | null;
  resolvedByUserId: number | null;
  resolvedAt: Date | null;
  committedEntityType: string | null;
  committedEntityId: string | null;
  committedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ApprovalEventDto<TPayload = unknown> = {
  id: number;
  sequence: number;
  eventType: ApprovalEventType;
  actorUserId: number;
  actorName: string;
  workflowNodeKey: string | null;
  fromStatus: ApprovalStatus | null;
  toStatus: ApprovalStatus | null;
  comment: string | null;
  payloadSnapshot: TPayload | null;
  createdAt: string;
};

export type ApprovalRequestDto<TPayload = unknown> = {
  id: number;
  resourceKey: string;
  scopeId: string | null;
  businessActionKey: string;
  flowType: ApprovalFlowType;
  separationPolicy: ApprovalSeparationPolicy;
  handlerSource: ApprovalHandlerSource;
  workflowNodes: WorkflowPolicyNodeDefinition[];
  activeWorkflowNodeKey: string | null;
  activeWorkflowNodeKeys: string[];
  workflowJoinState: ApprovalWorkflowJoinState;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  subjectType: string;
  subjectId: string | null;
  operation: ApprovalOperation;
  status: ApprovalStatus;
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
  events: ApprovalEventDto<TPayload>[];
  canProcess?: boolean;
};

export type ApprovalRequestDescription = {
  title: string;
  summary: string;
  href: string;
};

export type ApprovalCommitResult = {
  entityType: string;
  entityId: string | number;
};

export type ApprovalAdapter<TPayload> = {
  subjectType: string;
  workflowDefaults?: WorkflowPolicyDefaults | ((input: {
    actorUserId?: number | null;
    operation: ApprovalOperation;
    prepared?: ApprovalPreparedPayload<TPayload>;
    request?: ApprovalRequestRecord<TPayload>;
  }) => Promise<WorkflowPolicyDefaults> | WorkflowPolicyDefaults);
  validatePayload: (input: {
    actorUserId: number;
    operation: ApprovalOperation;
    subjectId?: string | null;
    payload: unknown;
    request?: ApprovalRequestRecord<TPayload>;
  }) => Promise<ServiceResult<ApprovalPreparedPayload<TPayload>>> | ServiceResult<ApprovalPreparedPayload<TPayload>>;
  resolveAccess: (input: {
    actorUserId: number;
    action: ApprovalAccessAction;
    prepared?: ApprovalPreparedPayload<TPayload>;
    request?: ApprovalRequestRecord<TPayload>;
  }) => Promise<boolean> | boolean;
  resolveRecipients: (input: {
    eventType: ApprovalEventType;
    actorUserId: number;
    request: ApprovalRequestRecord<TPayload>;
  }) => Promise<number[]> | number[];
  resolveHandlers?: (input: {
    handlerSource: ApprovalHandlerSource;
    actorUserId: number;
    request: ApprovalRequestRecord<TPayload>;
  }) => Promise<number[]> | number[];
  describeRequest: (input: {
    request: ApprovalRequestRecord<TPayload>;
  }) => Promise<ApprovalRequestDescription> | ApprovalRequestDescription;
  commitApprovedPayload: (input: {
    actorUserId: number;
    request: ApprovalRequestRecord<TPayload>;
  }) => Promise<ServiceResult<ApprovalCommitResult>> | ServiceResult<ApprovalCommitResult>;
};
