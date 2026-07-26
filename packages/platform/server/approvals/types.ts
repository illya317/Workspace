import type { ServiceResult } from "../api";
import type { ApprovalCommitAuthorization } from "@workspace/platform/server/approval-commit-authorization";
import type {
  WorkflowFlowType,
  WorkflowHandlerSource,
  WorkflowPolicyNodeDefinition,
  WorkflowPolicyDefaults,
  WorkflowPolicyMode,
  WorkflowSeparationPolicy,
} from "../workflows";
import type {
  ApprovalRequestDescription,
  ApprovalRequestEventType,
  ApprovalRequestEventViewDto,
  ApprovalRequestOperation,
  ApprovalRequestStatus,
  ApprovalRequestViewDto,
} from "../../workflow-request-contract";

export type ApprovalStatus = ApprovalRequestStatus;
export type ApprovalOperation = ApprovalRequestOperation;
export type ApprovalEventType = ApprovalRequestEventType;

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

export type ApprovalWorkflowPolicySnapshot = {
  businessActionKey: string;
  scopeType: string;
  scopeId: string;
  mode: ApprovalWorkflowPolicyMode;
  flowType: ApprovalFlowType;
  separationPolicy: ApprovalSeparationPolicy;
  handlerSource: ApprovalHandlerSource;
  workflowNodes: WorkflowPolicyNodeDefinition[];
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  policyId: number | null;
  policyVersion: number | null;
};

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
  workflowPolicySnapshot?: ApprovalWorkflowPolicySnapshot | null;
  sourceActionContractVersion?: number | null;
  sourceOkrControlVersion?: number | null;
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
  sourceWorkflowPolicyId: number | null;
  sourceWorkflowPolicyVersion: number | null;
  sourceActionContractVersion: number | null;
  sourceOkrControlVersion: number | null;
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

export type ApprovalEventDto<TPayload = unknown> = ApprovalRequestEventViewDto<TPayload>;

export type ApprovalRequestDto<TPayload = unknown> = ApprovalRequestViewDto<TPayload> & {
  handlerSource: ApprovalHandlerSource;
  workflowNodes: WorkflowPolicyNodeDefinition[];
  activeWorkflowNodeKey: string | null;
  activeWorkflowNodeKeys: string[];
  workflowJoinState: ApprovalWorkflowJoinState;
};

export type { ApprovalRequestDescription };

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
    approvalAuthorization: ApprovalCommitAuthorization;
  }) => Promise<ServiceResult<ApprovalCommitResult>> | ServiceResult<ApprovalCommitResult>;
};
