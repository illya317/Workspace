import type { ApprovalHandlerSource, ApprovalRequestRecord } from "@workspace/platform/server/approvals";
import { resolveWorkflowNodeHandlerUserIds } from "@workspace/platform/server/approvals/workflow-node-handlers";
import { listDepartmentResponsibleUserIds, listDirectManagerUserIds } from "@workspace/platform/server/business-space-natural-users";
import { prisma } from "@workspace/platform/server/prisma";
import { canApproveWorkTaskAction } from "./access";
import { approvalControlTarget, type WorkTaskApprovalPayload } from "./task-approval-helpers";

export async function canProcessWorkTaskRequest(
  actorUserId: number,
  request: ApprovalRequestRecord<WorkTaskApprovalPayload>,
) {
  return canProcessWorkTaskRequestWithPermission(
    actorUserId,
    request,
    (payload) => canApproveWorkTaskPayload(actorUserId, payload),
  );
}

export async function canProcessWorkTaskRequests(
  actorUserId: number,
  requests: readonly ApprovalRequestRecord<WorkTaskApprovalPayload>[],
) {
  const permissionsByTarget = new Map<string, Promise<boolean>>();
  const resolvePermission = (payload: WorkTaskApprovalPayload) => {
    const target = approvalControlTarget(payload);
    if (!target) return Promise.resolve(false);
    const key = `${target.targetType}:${target.targetId}`;
    let pending = permissionsByTarget.get(key);
    if (!pending) {
      pending = canApproveWorkTaskAction(actorUserId, target.targetType, target.targetId);
      permissionsByTarget.set(key, pending);
    }
    return pending;
  };
  return Promise.all(requests.map((request) => (
    canProcessWorkTaskRequestWithPermission(actorUserId, request, resolvePermission)
  )));
}

async function canProcessWorkTaskRequestWithPermission(
  actorUserId: number,
  request: ApprovalRequestRecord<WorkTaskApprovalPayload>,
  canApprovePayload: (payload: WorkTaskApprovalPayload) => Promise<boolean>,
) {
  const payload = request.latestPayload;
  let actorPermissionHandlers: Promise<number[]> | null = null;
  const resolvePermission = () => {
    actorPermissionHandlers ??= canApprovePayload(payload)
      .then((allowed) => allowed ? [actorUserId] : []);
    return actorPermissionHandlers;
  };
  if (request.activeWorkflowNodeKey) {
    const handlers = await resolveWorkflowNodeHandlerUserIds(request, {
      resolveRelationship: (source): Promise<number[]> => resolveWorkTaskHandlerUserIds(source, { ...request, activeWorkflowNodeKey: null }),
      resolvePermission,
    });
    return handlers.includes(actorUserId);
  }
  if (request.handlerSource === "direct_manager") {
    return (await listDirectManagerUserIds(request.submitterUserId)).includes(actorUserId);
  }
  const controlTarget = approvalControlTarget(payload);
  if (request.handlerSource === "department_owner") {
    return Boolean(
      controlTarget?.targetType === "department"
      && (await listDepartmentResponsibleUserIds(controlTarget.targetId)).includes(actorUserId),
    );
  }
  return (await resolvePermission()).length > 0;
}

export async function resolveWorkTaskHandlerUserIds(
  handlerSource: ApprovalHandlerSource,
  request: ApprovalRequestRecord<WorkTaskApprovalPayload>,
  excludeUserId: number | null = null,
): Promise<number[]> {
  const payload = request.latestPayload;
  if (request.activeWorkflowNodeKey) {
    return resolveWorkflowNodeHandlerUserIds(request, {
      excludeUserId,
      resolveRelationship: (source): Promise<number[]> => resolveWorkTaskHandlerUserIds(source, { ...request, activeWorkflowNodeKey: null }, excludeUserId),
      resolvePermission: () => listWorkTaskApproverUserIds(payload, excludeUserId),
    });
  }
  if (handlerSource === "direct_manager") {
    return filterUserIds(await listDirectManagerUserIds(request.submitterUserId), excludeUserId);
  }
  const controlTarget = approvalControlTarget(payload);
  if (handlerSource === "department_owner" && controlTarget?.targetType === "department") {
    return filterUserIds(await listDepartmentResponsibleUserIds(controlTarget.targetId), excludeUserId);
  }
  if (handlerSource === "department_owner") return [];
  return listWorkTaskApproverUserIds(payload, excludeUserId);
}

async function listWorkTaskApproverUserIds(payload: WorkTaskApprovalPayload, excludeUserId: number | null) {
  const controlTarget = approvalControlTarget(payload);
  if (!controlTarget) return [];
  const users = await prisma.user.findMany({
    where: { canLogin: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  const allowed = await Promise.all(users.map(async (user) => (
    await canApproveWorkTaskAction(user.id, controlTarget.targetType, controlTarget.targetId) ? user.id : null
  )));
  return allowed.filter((id): id is number => id !== null);
}

async function canApproveWorkTaskPayload(actorUserId: number, payload: WorkTaskApprovalPayload) {
  const controlTarget = approvalControlTarget(payload);
  return Boolean(
    controlTarget
    && await canApproveWorkTaskAction(actorUserId, controlTarget.targetType, controlTarget.targetId),
  );
}

function filterUserIds(userIds: number[], excludeUserId: number | null) {
  return Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0 && id !== excludeUserId)));
}
