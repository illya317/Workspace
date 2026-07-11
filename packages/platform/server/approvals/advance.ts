import { serviceError, serviceOk, type ServiceResult } from "../api";
import { prisma } from "../prisma";
import { notifyApproval } from "./notifications";
import {
  assertApprovalHandlersAvailable,
  assertWorkflowProcessAllowed,
  workflowResolutionEventType,
} from "./workflow";
import { canActorAutoProcess, recordAllApprovalProgressIfNeeded } from "./approval-mode";
import {
  appendApprovalEvent,
  applyApprovalTransition,
  claimApprovalForCommit,
  getApprovalRequestDto,
  recordApprovalCommitFailed,
} from "./store";
import { toRecord } from "./serialization";
import {
  activeWorkflowNodeKeys,
  requestForWorkflowNode,
  requestWithWorkflowState,
  workflowRuntimeUpdateData,
} from "./runtime";
import type { ApprovalAdapter, ApprovalRequestDto, ApprovalRequestRecord } from "./types";
import { resolveNextWorkflowStateForPayload, type WorkflowExecutionState } from "../workflow-policy-nodes";

export async function completeApprovalNode<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    request: ApprovalRequestRecord<TPayload>;
    actorUserId: number;
    comment?: string | null;
  },
): Promise<ServiceResult<{ request: ApprovalRequestDto<TPayload> }>> {
  if (!input.request.activeWorkflowNodeKey) return serviceError("当前审批单没有可处理的审批节点", 409);
  const nextState = resolveNextWorkflowStateForPayload(
    input.request.workflowNodes,
    input.request.latestPayload,
    {
      activeNodeKeys: activeWorkflowNodeKeys(input.request),
      joinState: input.request.workflowJoinState,
    },
    input.request.activeWorkflowNodeKey,
  );
  if (!nextState.ok) return nextState;
  if (nextState.data.activeNodeKeys.length > 0) {
    return advanceApprovalState(adapter, {
      request: input.request,
      actorUserId: input.actorUserId,
      comment: input.comment,
      nextState: nextState.data,
    });
  }
  return commitSubmittedApproval(adapter, {
    request: input.request,
    actorUserId: input.actorUserId,
    comment: input.comment,
    workflowNodeKey: input.request.activeWorkflowNodeKey,
  });
}

export async function commitSubmittedApproval<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    request: ApprovalRequestRecord<TPayload>;
    actorUserId: number;
    comment?: string | null;
    workflowNodeKey?: string | null;
  },
): Promise<ServiceResult<{ request: ApprovalRequestDto<TPayload> }>> {
  const claimed = await claimApprovalForCommit(adapter, input.request);
  if (!claimed.ok) return claimed;
  const committed = await adapter.commitApprovedPayload({
    actorUserId: input.actorUserId,
    request: claimed.data,
  });
  if (!committed.ok) {
    await recordApprovalCommitFailed(claimed.data, input.actorUserId, committed.error);
    return committed;
  }
  const now = new Date();
  const eventType = workflowResolutionEventType(claimed.data.flowType);
  const updated = await applyApprovalTransition(adapter, {
    request: claimed.data,
    actorUserId: input.actorUserId,
    eventType,
    toStatus: "approved",
    comment: input.comment,
    workflowNodeKey: input.workflowNodeKey ?? claimed.data.activeWorkflowNodeKey,
    updateData: {
      ...workflowRuntimeUpdateData({ activeNodeKeys: [], joinState: claimed.data.workflowJoinState }),
      resolvedByUserId: input.actorUserId,
      resolvedAt: now,
      committedEntityType: committed.data.entityType,
      committedEntityId: String(committed.data.entityId),
      committedAt: now,
    },
  });
  if (!updated.ok) return updated;
  await notifyApproval(adapter, eventType, updated.data.record, input.actorUserId);
  return serviceOk({ request: updated.data.dto });
}

async function advanceApprovalState<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    request: ApprovalRequestRecord<TPayload>;
    actorUserId: number;
    comment?: string | null;
    nextState: WorkflowExecutionState;
  },
): Promise<ServiceResult<{ request: ApprovalRequestDto<TPayload> }>> {
  const nextRequest = requestWithWorkflowState(input.request, input.nextState);
  const handlersAvailable = await assertApprovalHandlersAvailable(adapter, nextRequest, input.actorUserId);
  if (!handlersAvailable.ok) return handlersAvailable;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.approvalRequest.updateMany({
      where: { id: input.request.id, status: "submitted", version: input.request.version },
      data: {
        ...workflowRuntimeUpdateData(input.nextState),
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) return null;
    const next = await tx.approvalRequest.findUnique({ where: { id: input.request.id } });
    if (!next) return null;
    await appendApprovalEvent(tx, {
      requestId: input.request.id,
      eventType: "approve",
      actorUserId: input.actorUserId,
      workflowNodeKey: input.request.activeWorkflowNodeKey,
      fromStatus: "submitted",
      toStatus: "submitted",
      comment: input.comment,
      payload: input.request.latestPayload,
    });
    return next;
  });
  if (!updated) return serviceError("审批单已被其他人处理，请刷新后重试", 409);
  const dto = await getApprovalRequestDto(adapter, updated.id);
  if (!dto.ok) return dto;
  const advancedRequest = toRecord(updated, input.request.latestPayload);
  return autoProcessNextActorNode(adapter, {
    request: advancedRequest,
    actorUserId: input.actorUserId,
    comment: input.comment,
    fallback: dto.data,
  });
}

async function autoProcessNextActorNode<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    request: ApprovalRequestRecord<TPayload>;
    actorUserId: number;
    comment?: string | null;
    fallback: ApprovalRequestDto<TPayload>;
  },
) {
  for (const activeKey of activeWorkflowNodeKeys(input.request)) {
    const nodeRequest = requestForWorkflowNode(input.request, activeKey);
    const processAllowed = assertWorkflowProcessAllowed(nodeRequest, input.actorUserId);
    const canAutoApprove = processAllowed.ok
      && await canActorAutoProcess(adapter, nodeRequest, input.actorUserId);
    if (!canAutoApprove) continue;
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
  await notifyApproval(adapter, "approve", input.request, input.actorUserId);
  return serviceOk({ request: input.fallback });
}
