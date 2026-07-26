import { serviceError, serviceOk } from "../api";
import { prisma } from "../prisma";
import { activeWorkflowNodeKeys, requestForWorkflowNode } from "./runtime";
import {
  requestInclude,
  toDto,
  toRecord,
  type ApprovalRequestRowWithEvents,
} from "./serialization";
import { getApprovalRequestDto } from "./store";
import type {
  ApprovalAdapter,
  ApprovalRequestRecord,
  ApprovalStatus,
} from "./types";
import { assertWorkflowProcessAllowed } from "./workflow";

export async function findManualProcessableNode<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  request: ApprovalRequestRecord<TPayload>,
  actorUserId: number,
) {
  for (const activeKey of activeWorkflowNodeKeys(request)) {
    const nodeRequest = requestForWorkflowNode(request, activeKey);
    if (assertWorkflowProcessAllowed(nodeRequest, actorUserId).ok && await adapter.resolveAccess({
      actorUserId,
      action: "approve",
      request: nodeRequest,
    })) return nodeRequest;
  }
  return null;
}

export async function listRequests<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  actorUserId: number;
  resourceKey?: string | null;
  scopeId?: string | null;
  submitterUserId?: number;
  statuses?: ApprovalStatus[];
  limit?: number;
}) {
  const probe = input.resourceKey || input.scopeId
    ? ({ resourceKey: input.resourceKey || "", scopeId: input.scopeId ?? null } as ApprovalRequestRecord<TPayload>)
    : undefined;
  if (!(await input.adapter.resolveAccess({ actorUserId: input.actorUserId, action: "listRequests", request: probe }))) {
    return serviceError("无权限查看审批单", 403);
  }
  const rows = await prisma.approvalRequest.findMany({
    where: {
      subjectType: input.adapter.subjectType,
      ...(input.resourceKey ? { resourceKey: input.resourceKey } : {}),
      ...(input.scopeId !== undefined ? { scopeId: input.scopeId } : {}),
      ...(input.submitterUserId ? { submitterUserId: input.submitterUserId } : {}),
      ...(input.statuses?.length ? { status: { in: input.statuses } } : {}),
    },
    include: requestInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(input.limit ?? 50, 1), 100),
  });
  const requests = await Promise.all(rows.map(async (row) => {
    const dto = toDto<TPayload>(row as ApprovalRequestRowWithEvents);
    const record = toRecord(row as ApprovalRequestRowWithEvents, dto.latestPayload);
    const [canProcess, description] = await Promise.all([
      dto.status === "submitted"
        ? findManualProcessableNode(input.adapter, record, input.actorUserId).then(Boolean)
        : false,
      input.adapter.describeRequest({ request: record }),
    ]);
    return {
      ...dto,
      canProcess,
      description,
    };
  }));
  return serviceOk({ requests });
}

export function getApprovalRequest<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  requestId: number,
) {
  return getApprovalRequestDto(adapter, requestId);
}
