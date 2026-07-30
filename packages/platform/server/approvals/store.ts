import { serviceError, serviceOk, type ServiceResult } from "../../service-result";
import { prisma, Prisma } from "../prisma";
import {
  normalizeComment,
  parsePayload,
  requestInclude,
  stringifyPayload,
  toDto,
  toRecord,
  type ApprovalRequestRowWithEvents,
} from "./serialization";
import type {
  ApprovalAdapter,
  ApprovalEventType,
  ApprovalPreparedPayload,
  ApprovalRequestDto,
  ApprovalRequestRecord,
  ApprovalStatus,
} from "./types";

export async function getApprovalRequestDto<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  requestId: number,
) {
  const row = await prisma.approvalRequest.findFirst({
    where: { id: requestId, subjectType: adapter.subjectType },
    include: requestInclude,
  });
  if (!row) return serviceError("审批单不存在", 404);
  return serviceOk(toDto(row as ApprovalRequestRowWithEvents) as ApprovalRequestDto<TPayload>);
}

export async function loadApprovalRecord<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  requestId: number,
): Promise<ServiceResult<ApprovalRequestRecord<TPayload>>> {
  const row = await prisma.approvalRequest.findFirst({
    where: { id: requestId, subjectType: adapter.subjectType },
  });
  if (!row) return serviceError("审批单不存在", 404);
  return serviceOk(toRecord(row, parsePayload<TPayload>(row.latestPayloadJson)));
}

export async function applyApprovalTransition<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    request: ApprovalRequestRecord<TPayload>;
    actorUserId: number;
    eventType: ApprovalEventType;
    toStatus: ApprovalStatus;
    comment?: string | null;
    workflowNodeKey?: string | null;
    updateData?: Prisma.ApprovalRequestUncheckedUpdateInput;
  },
) {
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.approvalRequest.updateMany({
      where: { id: input.request.id, status: input.request.status, version: input.request.version },
      data: {
        ...input.updateData,
        status: input.toStatus,
        version: { increment: 1 },
      } as Prisma.ApprovalRequestUncheckedUpdateInput,
    });
    if (result.count !== 1) return null;
    const next = await tx.approvalRequest.findUnique({ where: { id: input.request.id } });
    if (!next) return null;
    await appendApprovalEvent(tx, {
      requestId: input.request.id,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      workflowNodeKey: input.workflowNodeKey ?? input.request.activeWorkflowNodeKey,
      fromStatus: input.request.status,
      toStatus: input.toStatus,
      comment: input.comment,
      payload: input.request.latestPayload,
    });
    return next;
  });
  if (!updated) return serviceError("审批单已被其他人更新，请刷新后重试", 409);
  const dto = await getApprovalRequestDto(adapter, updated.id);
  if (!dto.ok) return dto;
  return serviceOk({ dto: dto.data, record: toRecord(updated, input.request.latestPayload) });
}

export async function updateApprovalPayload<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    request: ApprovalRequestRecord<TPayload>;
    actorUserId: number;
    prepared: ApprovalPreparedPayload<TPayload>;
    eventType: "revise" | "review_update";
    comment?: string | null;
    workflowData?: Prisma.ApprovalRequestUncheckedUpdateInput;
  },
) {
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.approvalRequest.updateMany({
      where: { id: input.request.id, status: input.request.status, version: input.request.version },
      data: {
        ...input.workflowData,
        resourceKey: input.prepared.resourceKey,
        scopeId: input.prepared.scopeId ?? null,
        subjectId: input.prepared.subjectId ?? input.request.subjectId,
        latestPayloadJson: stringifyPayload(input.prepared.payload),
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) return null;
    const next = await tx.approvalRequest.findUnique({ where: { id: input.request.id } });
    if (!next) return null;
    await appendApprovalEvent(tx, {
      requestId: input.request.id,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      fromStatus: input.request.status,
      toStatus: input.request.status,
      comment: input.comment,
      payload: input.prepared.payload,
    });
    return next;
  });
  if (!updated) return serviceError("审批单已被其他人更新，请刷新后重试", 409);
  const dto = await getApprovalRequestDto(adapter, updated.id);
  return dto.ok ? serviceOk({ request: dto.data }) : dto;
}

export async function claimApprovalForCommit<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  request: ApprovalRequestRecord<TPayload>,
) {
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.approvalRequest.updateMany({
      where: { id: request.id, status: "submitted", version: request.version },
      data: {
        status: "committing",
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) return null;
    return tx.approvalRequest.findUnique({ where: { id: request.id } });
  });
  if (!updated) return serviceError("审批单已被其他人处理，请刷新后重试", 409);
  return serviceOk(toRecord(updated, request.latestPayload));
}

export async function recordApprovalCommitFailed<TPayload>(
  request: ApprovalRequestRecord<TPayload>,
  actorUserId: number,
  error: string,
) {
  await prisma.$transaction(async (tx) => {
    const result = await tx.approvalRequest.updateMany({
      where: { id: request.id, status: request.status, version: request.version },
      data: {
        status: "submitted",
        resolvedByUserId: null,
        resolvedAt: null,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) return;
    await appendApprovalEvent(tx, {
      requestId: request.id,
      eventType: "commit_failed",
      actorUserId,
      fromStatus: request.status,
      toStatus: "submitted",
      comment: error,
      payload: request.latestPayload,
    });
  });
}

export async function appendApprovalEvent<TPayload>(
  tx: Prisma.TransactionClient,
  input: {
    requestId: number;
    eventType: ApprovalEventType;
    actorUserId: number;
    workflowNodeKey?: string | null;
    fromStatus: ApprovalStatus | null;
    toStatus: ApprovalStatus | null;
    comment?: string | null;
    payload?: TPayload;
  },
) {
  const previous = await tx.approvalEvent.findFirst({
    where: { requestId: input.requestId },
    select: { sequence: true },
    orderBy: { sequence: "desc" },
  });
  await tx.approvalEvent.create({
    data: {
      requestId: input.requestId,
      sequence: (previous?.sequence ?? 0) + 1,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      workflowNodeKey: input.workflowNodeKey ?? null,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      comment: normalizeComment(input.comment),
      payloadJson: input.payload === undefined ? null : stringifyPayload(input.payload),
    },
  });
}

export function assertApprovalVersion<TPayload>(
  request: ApprovalRequestRecord<TPayload>,
  expectedVersion: number | null | undefined,
) {
  if (expectedVersion === null || expectedVersion === undefined) return serviceOk({ ok: true });
  if (request.version !== expectedVersion) return serviceError("审批单已被其他人更新，请刷新后重试", 409);
  return serviceOk({ ok: true });
}
