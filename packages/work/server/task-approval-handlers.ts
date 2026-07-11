import type { ApprovalHandlerSource, ApprovalRequestRecord } from "@workspace/platform/server/approvals";
import { resolveWorkflowNodeHandlerUserIds } from "@workspace/platform/server/approvals/workflow-node-handlers";
import { isSuperAdmin } from "@workspace/platform/server/auth";
import { listDepartmentResponsibleUserIds, listDirectManagerUserIds } from "@workspace/platform/server/business-space-natural-users";
import { prisma } from "@workspace/platform/server/prisma";
import { canApproveWorkTaskAction } from "./access";
import { approvalControlTarget, type WorkTaskApprovalPayload } from "./task-approval-helpers";

export async function canProcessWorkTaskRequest(
  actorUserId: number,
  request: ApprovalRequestRecord<WorkTaskApprovalPayload>,
) {
  if (await isSuperAdmin(actorUserId)) return true;
  const handlers = await resolveWorkTaskHandlerUserIds(request.handlerSource, request);
  return handlers.includes(actorUserId);
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

function filterUserIds(userIds: number[], excludeUserId: number | null) {
  return Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0 && id !== excludeUserId)));
}
