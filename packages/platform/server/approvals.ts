import { serviceError, serviceOk } from "./api";
import { notifyApproval } from "./approvals/notifications";
import {
  canActorAutoProcess,
  recordAllApprovalProgressIfNeeded,
} from "./approvals/approval-mode";
import { commitSubmittedApproval, completeApprovalNode } from "./approvals/advance";
import { activeWorkflowNodeKeys, requestForWorkflowNode } from "./approvals/runtime";
import { assertRequestLifecycleAction } from "./approvals/lifecycle";
import {
  stringifyPayload,
  toRecord,
} from "./approvals/serialization";
import {
  appendApprovalEvent,
  applyApprovalTransition,
  assertApprovalVersion,
  getApprovalRequestDto,
  loadApprovalRecord,
  transitionApprovalWithNotification,
  updateApprovalPayload,
} from "./approvals/store";
export type {
  ApprovalAccessAction,
  ApprovalAdapter,
  ApprovalCommitResult,
  ApprovalEventDto,
  ApprovalEventType,
  ApprovalFlowType,
  ApprovalHandlerSource,
  ApprovalOperation,
  ApprovalPreparedPayload,
  ApprovalRequestDescription,
  ApprovalRequestDto,
  ApprovalRequestRecord,
  ApprovalSeparationPolicy,
  ApprovalStatus,
  ApprovalWorkflowPolicyMode,
  ApprovalWorkflowPolicySnapshot,
} from "./approvals/types";
export { describeApprovalRequestFromContract, renderDescriptionTemplate } from "./approvals/contract-description";
import type {
  ApprovalAdapter,
  ApprovalOperation,
  ApprovalPreparedPayload,
  ApprovalRequestRecord,
} from "./approvals/types";
import type { ResolvedWorkflowPolicy } from "./workflows";
import {
  assertApprovalHandlersAvailable,
  assertWorkflowProcessAllowed,
  resolveExecutableWorkflowPolicy,
  resolveApprovalWorkflowPolicy,
  workflowCreationData,
  workflowUpdateData,
} from "./approvals/workflow";
import { prisma } from "./prisma";
import {
  validateApprovalRequestAtPhase,
  validatePreparedApprovalAtPhase,
} from "./approvals/contract-validation";
import { findManualProcessableNode } from "./approvals/read";
export { getApprovalRequest, listRequests } from "./approvals/read";
export async function createDraft<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: unknown;
  comment?: string | null;
}) {
  const prepared = await prepareApprovalDraft(input);
  if (!prepared.ok) return prepared;
  return createPreparedApprovalDraft({
    ...input,
    prepared: prepared.data.prepared,
    workflowPolicy: prepared.data.workflowPolicy,
  });
}

export async function prepareApprovalDraft<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: unknown;
}) {
  const prepared = await input.adapter.validatePayload({
    actorUserId: input.actorUserId,
    operation: input.operation,
    subjectId: input.subjectId,
    payload: input.payload,
  });
  if (!prepared.ok) return prepared;
  const workflowPolicy = await resolveApprovalWorkflowPolicy(input.adapter, {
    actorUserId: input.actorUserId,
    operation: input.operation,
    prepared: prepared.data,
  });
  return serviceOk({ prepared: prepared.data, workflowPolicy });
}

export async function createPreparedApprovalDraft<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  prepared: ApprovalPreparedPayload<TPayload>;
  workflowPolicy: ResolvedWorkflowPolicy;
  comment?: string | null;
}) {
  const validated = await validatePreparedApprovalAtPhase({
    adapter: input.adapter,
    phase: "draft",
    actorUserId: input.actorUserId,
    operation: input.operation,
    subjectId: input.subjectId,
    prepared: input.prepared,
    businessActionKey: input.workflowPolicy.businessActionKey,
    sourceActionContractVersion: input.prepared.sourceActionContractVersion,
    expectedIdentity: {
      resourceKey: input.prepared.resourceKey,
      scopeId: input.prepared.scopeId ?? null,
      subjectId: input.prepared.subjectId ?? input.subjectId ?? null,
    },
  });
  if (!validated.ok) return validated;
  const prepared = validated.data.prepared;
  if (!(await input.adapter.resolveAccess({
    actorUserId: input.actorUserId,
    action: "createDraft",
    prepared,
  }))) {
    return serviceError("无权限发起审批", 403);
  }
  const workflowPolicy = input.workflowPolicy;
  if (workflowPolicy.mode === "direct" || workflowPolicy.mode === "permission_only") {
    return serviceError("该行为未启用流程，请直接保存", 409);
  }

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.approvalRequest.create({
      data: {
        resourceKey: prepared.resourceKey,
        scopeId: prepared.scopeId ?? null,
        ...workflowCreationData(workflowPolicy, prepared),
        subjectType: input.adapter.subjectType,
        subjectId: prepared.subjectId ?? input.subjectId ?? null,
        operation: input.operation,
        status: "draft",
        latestPayloadJson: stringifyPayload(prepared.payload),
        submitterUserId: input.actorUserId,
      },
    });
    await appendApprovalEvent(tx, {
      requestId: request.id,
      eventType: "create_draft",
      actorUserId: input.actorUserId,
      fromStatus: null,
      toStatus: "draft",
      comment: input.comment,
      payload: prepared.payload,
    });
    return request;
  });

  const dto = await getApprovalRequestDto(input.adapter, created.id);
  return dto.ok ? serviceOk({ request: dto.data }) : dto;
}

export async function submit<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  requestId: number;
  actorUserId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  const request = await loadApprovalRecord(input.adapter, input.requestId);
  if (!request.ok) return request;
  const submitAccess = assertRequestLifecycleAction(request.data, input.actorUserId, "submit");
  if (!submitAccess.ok) return submitAccess;
  const version = assertApprovalVersion(request.data, input.expectedVersion);
  if (!version.ok) return version;
  const validated = await validateApprovalRequestAtPhase({
    adapter: input.adapter,
    phase: "submit",
    actorUserId: request.data.submitterUserId,
    request: request.data,
  });
  if (!validated.ok) return validated;
  const validatedRequest = {
    ...request.data,
    latestPayload: validated.data.prepared.payload,
  };
  const workflowPolicy = await resolveApprovalWorkflowPolicy(input.adapter, {
    actorUserId: input.actorUserId,
    operation: validatedRequest.operation,
    request: validatedRequest,
  });
  if (workflowPolicy.mode === "direct" || workflowPolicy.mode === "permission_only") {
    return serviceError("该行为未启用流程，请直接保存", 409);
  }
  const executablePolicy = resolveExecutableWorkflowPolicy(workflowPolicy, validatedRequest.latestPayload);
  if (!executablePolicy.ok) return executablePolicy;
  const requestWithWorkflowPolicy = {
    ...validatedRequest,
    ...workflowUpdateData(executablePolicy.data),
  };
  const hasWorkflowNodes = activeWorkflowNodeKeys(requestWithWorkflowPolicy).length > 0;
  if (hasWorkflowNodes) {
    const handlersAvailable = await assertApprovalHandlersAvailable(
      input.adapter,
      requestWithWorkflowPolicy,
      input.actorUserId,
    );
    if (!handlersAvailable.ok) return handlersAvailable;
  }
  const submitted = await applyApprovalTransition(input.adapter, {
    request: validatedRequest,
    actorUserId: input.actorUserId,
    eventType: "submit",
    toStatus: "submitted",
    comment: input.comment,
    workflowNodeKey: executablePolicy.data.activeWorkflowNodeKey,
    updateData: {
      ...workflowUpdateData(executablePolicy.data),
      latestPayloadJson: stringifyPayload(validatedRequest.latestPayload),
      submittedAt: new Date(),
      resolvedByUserId: null,
      resolvedAt: null,
    },
  });
  if (!submitted.ok) return submitted;
  const submittedRequest = submitted.data.record;
  if (!hasWorkflowNodes) {
    return commitSubmittedApproval(input.adapter, {
      request: submittedRequest,
      actorUserId: input.actorUserId,
      comment: input.comment,
      workflowNodeKey: null,
    });
  }
  if (submittedRequest.separationPolicy === "independent_required") {
    await notifyApproval(input.adapter, "submit", submittedRequest, input.actorUserId);
    return serviceOk({ request: submitted.data.dto });
  }
  const autoRequest = await findAutoProcessableNode(input.adapter, submittedRequest, input.actorUserId);
  if (!autoRequest) {
    await notifyApproval(input.adapter, "submit", submittedRequest, input.actorUserId);
    return serviceOk({ request: submitted.data.dto });
  }
  return approveLoadedRequest(input.adapter, {
    request: autoRequest,
    actorUserId: input.actorUserId,
    comment: input.comment,
    skipAccessCheck: true,
  });
}

export async function revise<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  requestId: number;
  actorUserId: number;
  payload: unknown;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  const request = await loadApprovalRecord(input.adapter, input.requestId);
  if (!request.ok) return request;
  const reviseAccess = assertRequestLifecycleAction(request.data, input.actorUserId, "revise");
  if (!reviseAccess.ok) return reviseAccess;
  const version = assertApprovalVersion(request.data, input.expectedVersion);
  if (!version.ok) return version;
  const prepared = await input.adapter.validatePayload({
    actorUserId: input.actorUserId,
    operation: request.data.operation,
    subjectId: request.data.subjectId,
    payload: input.payload,
    request: request.data,
  });
  if (!prepared.ok) return prepared;
  const workflowPolicy = await resolveApprovalWorkflowPolicy(input.adapter, {
    actorUserId: input.actorUserId,
    operation: request.data.operation,
    prepared: prepared.data,
    request: request.data,
  });
  return updateApprovalPayload(input.adapter, {
    request: request.data,
    actorUserId: input.actorUserId,
    prepared: prepared.data,
    eventType: "revise",
    comment: input.comment,
    workflowData: workflowUpdateData(workflowPolicy),
  });
}

export async function reviewUpdate<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  requestId: number;
  actorUserId: number;
  payload: unknown;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  const request = await loadApprovalRecord(input.adapter, input.requestId);
  if (!request.ok) return request;
  if (request.data.status !== "submitted") return serviceError("只有待审批状态可以审核修改", 409);
  if (!request.data.handlerCanRevise) return serviceError("该流程不允许处理人修改请求", 403);
  const version = assertApprovalVersion(request.data, input.expectedVersion);
  if (!version.ok) return version;
  const prepared = await input.adapter.validatePayload({
    actorUserId: input.actorUserId,
    operation: request.data.operation,
    subjectId: request.data.subjectId,
    payload: input.payload,
    request: request.data,
  });
  if (!prepared.ok) return prepared;
  if (!(await input.adapter.resolveAccess({
    actorUserId: input.actorUserId,
    action: "reviewUpdate",
    prepared: prepared.data,
    request: request.data,
  }))) {
    return serviceError("无权限审核修改该审批单", 403);
  }
  const processAllowed = assertWorkflowProcessAllowed(request.data, input.actorUserId);
  if (!processAllowed.ok) return processAllowed;
  const workflowPolicy = await resolveApprovalWorkflowPolicy(input.adapter, {
    actorUserId: input.actorUserId,
    operation: request.data.operation,
    prepared: prepared.data,
    request: request.data,
  });
  return updateApprovalPayload(input.adapter, {
    request: request.data,
    actorUserId: input.actorUserId,
    prepared: prepared.data,
    eventType: "review_update",
    comment: input.comment,
    workflowData: workflowUpdateData(workflowPolicy),
  });
}

export async function withdraw<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  requestId: number;
  actorUserId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return transitionApprovalWithNotification(input.adapter, {
    requestId: input.requestId,
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedVersion,
    eventType: "withdraw",
    allowedFrom: ["submitted"],
    toStatus: "withdrawn",
    comment: input.comment,
    authorize: (request) => assertRequestLifecycleAction(request, input.actorUserId, "withdraw"),
  });
}

export async function cancel<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  requestId: number;
  actorUserId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return transitionApprovalWithNotification(input.adapter, {
    requestId: input.requestId,
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedVersion,
    eventType: "cancel",
    allowedFrom: ["draft", "submitted", "withdrawn"],
    toStatus: "cancelled",
    comment: input.comment,
    authorize: (request) => assertRequestLifecycleAction(request, input.actorUserId, "cancel"),
  });
}

export async function comment<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  requestId: number;
  actorUserId: number;
  comment: string;
  expectedVersion?: number | null;
}) {
  const text = input.comment.trim();
  if (!text) return serviceError("评论不能为空", 400);
  const request = await loadApprovalRecord(input.adapter, input.requestId);
  if (!request.ok) return request;
  if (request.data.status === "cancelled") return serviceError("审批单已取消，不能评论", 409);
  if (request.data.status === "committing") return serviceError("审批单正在提交正式数据，请稍后再试", 409);
  const version = assertApprovalVersion(request.data, input.expectedVersion);
  if (!version.ok) return version;
  if (!(await input.adapter.resolveAccess({
    actorUserId: input.actorUserId,
    action: "comment",
    request: request.data,
  }))) {
    return serviceError("无权限评论该审批单", 403);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.approvalRequest.updateMany({
      where: {
        id: request.data.id,
        status: request.data.status,
        version: request.data.version,
      },
      data: { version: { increment: 1 } },
    });
    if (result.count !== 1) return null;
    const next = await tx.approvalRequest.findUnique({ where: { id: request.data.id } });
    if (!next) return null;
    await appendApprovalEvent(tx, {
      requestId: request.data.id,
      eventType: "comment",
      actorUserId: input.actorUserId,
      fromStatus: request.data.status,
      toStatus: request.data.status,
      comment: text,
    });
    return next;
  });
  if (!updated) return serviceError("审批单已被其他人更新，请刷新后重试", 409);
  const dto = await getApprovalRequestDto(input.adapter, updated.id);
  if (dto.ok) await notifyApproval(input.adapter, "comment", toRecord(updated, request.data.latestPayload), input.actorUserId);
  return dto.ok ? serviceOk({ request: dto.data }) : dto;
}

export async function reject<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  requestId: number;
  actorUserId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return transitionApprovalWithNotification(input.adapter, {
    requestId: input.requestId,
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedVersion,
    eventType: "reject",
    allowedFrom: ["submitted"],
    toStatus: "rejected",
    comment: input.comment,
    updateData: { resolvedByUserId: input.actorUserId, resolvedAt: new Date() },
    authorize: async (request) => {
      if (!(await input.adapter.resolveAccess({
        actorUserId: input.actorUserId,
        action: "reject",
        request,
      }))) return serviceError("无权限执行该审批动作", 403);
      return assertWorkflowProcessAllowed(request, input.actorUserId);
    },
  });
}

export async function approve<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  requestId: number;
  actorUserId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  const request = await loadApprovalRecord(input.adapter, input.requestId);
  if (!request.ok) return request;
  if (request.data.status !== "submitted") return serviceError("只有待审批状态可以同意", 409);
  const version = assertApprovalVersion(request.data, input.expectedVersion);
  if (!version.ok) return version;
  return approveLoadedRequest(input.adapter, {
    request: request.data,
    actorUserId: input.actorUserId,
    comment: input.comment,
  });
}

async function approveLoadedRequest<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    request: ApprovalRequestRecord<TPayload>;
    actorUserId: number;
    comment?: string | null;
    skipAccessCheck?: boolean;
  },
) {
  const nodeRequest = input.skipAccessCheck
    ? await findAutoProcessableNode(adapter, input.request, input.actorUserId)
    : await findManualProcessableNode(adapter, input.request, input.actorUserId);
  if (!nodeRequest) {
    return serviceError("无权限审批该审批单", 403);
  }
  const processAllowed = assertWorkflowProcessAllowed(nodeRequest, input.actorUserId);
  if (!processAllowed.ok) return processAllowed;
  const allApprovalProgress = await recordAllApprovalProgressIfNeeded(adapter, {
    request: nodeRequest,
    actorUserId: input.actorUserId,
    comment: input.comment,
  });
  if (!allApprovalProgress.ok) return allApprovalProgress;
  if (!allApprovalProgress.data.complete) return serviceOk({ request: allApprovalProgress.data.request });
  return completeApprovalNode(adapter, {
    request: nodeRequest,
    actorUserId: input.actorUserId,
    comment: input.comment,
  });
}

async function findAutoProcessableNode<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  request: ApprovalRequestRecord<TPayload>,
  actorUserId: number,
) {
  for (const activeKey of activeWorkflowNodeKeys(request)) {
    const nodeRequest = requestForWorkflowNode(request, activeKey);
    if (assertWorkflowProcessAllowed(nodeRequest, actorUserId).ok
      && await canActorAutoProcess(adapter, nodeRequest, actorUserId)) return nodeRequest;
  }
  return null;
}
