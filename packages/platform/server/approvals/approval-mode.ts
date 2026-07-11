import { serviceError, serviceOk } from "../api";
import { prisma } from "../prisma";
import { findWorkflowApprovalTarget } from "../workflow-policy-nodes";
import { appendApprovalEvent, getApprovalRequestDto } from "./store";
import type { ApprovalAdapter, ApprovalRequestRecord } from "./types";

export async function canActorAutoProcess<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  request: ApprovalRequestRecord<TPayload>,
  actorUserId: number,
) {
  if (adapter.resolveHandlers) {
    const handlers = await adapter.resolveHandlers({ handlerSource: request.handlerSource, request, actorUserId });
    const userIds = dedupeUserIds(handlers);
    if (activeApprovalMode(request) === "all") return userIds.length === 1 && userIds.includes(actorUserId);
    return userIds.includes(actorUserId);
  }
  return adapter.resolveAccess({ actorUserId, action: "approve", request });
}

export async function recordAllApprovalProgressIfNeeded<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    request: ApprovalRequestRecord<TPayload>;
    actorUserId: number;
    comment?: string | null;
  },
) {
  if (activeApprovalMode(input.request) !== "all" || !adapter.resolveHandlers) return serviceOk({ complete: true as const });
  const handlers = dedupeUserIds(await adapter.resolveHandlers({
    handlerSource: input.request.handlerSource,
    request: input.request,
    actorUserId: input.actorUserId,
  }));
  if (handlers.length <= 1) return serviceOk({ complete: true as const });
  const previous = await prisma.approvalEvent.findMany({
    where: {
      requestId: input.request.id,
      eventType: "approve",
      toStatus: "submitted",
      workflowNodeKey: input.request.activeWorkflowNodeKey,
    },
    select: { actorUserId: true },
  });
  const approved = new Set(previous.map((event) => event.actorUserId));
  if (approved.has(input.actorUserId)) return serviceError("你已完成该会签节点处理", 409);
  approved.add(input.actorUserId);
  if (handlers.every((handlerUserId) => approved.has(handlerUserId))) return serviceOk({ complete: true as const });

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.approvalRequest.updateMany({
      where: { id: input.request.id, status: "submitted", version: input.request.version },
      data: { version: { increment: 1 } },
    });
    if (result.count !== 1) return null;
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
    return tx.approvalRequest.findUnique({ where: { id: input.request.id } });
  });
  if (!updated) return serviceError("审批单已被其他人处理，请刷新后重试", 409);
  const dto = await getApprovalRequestDto(adapter, updated.id);
  if (!dto.ok) return dto;
  return serviceOk({ complete: false as const, request: dto.data });
}

function activeApprovalMode<TPayload>(request: ApprovalRequestRecord<TPayload>) {
  return findWorkflowApprovalTarget(request.workflowNodes, request.activeWorkflowNodeKey)?.approvalMode ?? "any_one";
}

function dedupeUserIds(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}
