import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";

export interface ProjectMemberNotificationResponseCommand {
  action: "acknowledge" | "reject";
  notificationIds: number[];
  recordId: number | null;
  changeUid: string | null;
}

const PROJECT_MEMBER_NOTIFICATION_TYPES = [
  "work.project.member.added",
  "work.project.member.roleChanged",
] as const;

function projectMemberNotificationTarget(payloadJson: string | null) {
  if (!payloadJson) return null;
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const projectId = Number(payload.projectId);
    const employeeId = Number(payload.employeeId);
    const recordId = Number(payload.recordId);
    const changeUid = typeof payload.changeUid === "string" && payload.changeUid.trim() ? payload.changeUid.trim() : null;
    return Number.isInteger(projectId) && projectId > 0 && Number.isInteger(employeeId) && employeeId > 0
      ? { projectId, employeeId, recordId: Number.isInteger(recordId) && recordId > 0 ? recordId : null, changeUid }
      : null;
  } catch {
    return null;
  }
}

export async function buildProjectMemberNotificationResponseCommand(
  userId: number,
  notificationId: number,
  action: "acknowledge" | "reject",
): Promise<DomainValidationResult<ProjectMemberNotificationResponseCommand>> {
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      recipientUserId: userId,
      type: { in: [...PROJECT_MEMBER_NOTIFICATION_TYPES] },
    },
    select: { payloadJson: true, acknowledgedAt: true, rejectedAt: true },
  });
  if (!notification) return failCommand("项目邀请不存在", 404);
  if (notification.acknowledgedAt || notification.rejectedAt) return failCommand("项目邀请已处理", 409);

  const target = projectMemberNotificationTarget(notification.payloadJson);
  if (!target) return failCommand("项目邀请数据无效", 409);
  const employee = await prisma.employee.findFirst({
    where: { id: target.employeeId, userId },
    select: { id: true },
  });
  if (!employee) return failCommand("只能处理自己的项目邀请", 403);

  const member = target.recordId
    ? await prisma.employeeProject.findFirst({
        where: { id: target.recordId, employeeId: target.employeeId, projectId: target.projectId },
        select: { id: true, recordState: true },
      })
    : await prisma.employeeProject.findFirst({
        where: { employeeId: target.employeeId, projectId: target.projectId, recordState: "confirmed" },
        orderBy: [{ sequence: "desc" }, { id: "desc" }],
        select: { id: true, recordState: true },
      });
  if (action === "acknowledge" && (!member || member.recordState !== "confirmed")) return failCommand("项目邀请已失效", 409);

  const pendingNotifications = await prisma.notification.findMany({
    where: {
      recipientUserId: userId,
      type: { in: [...PROJECT_MEMBER_NOTIFICATION_TYPES] },
      acknowledgedAt: null,
      rejectedAt: null,
    },
    select: { id: true, payloadJson: true },
  });
  const notificationIds = pendingNotifications
    .filter((candidate) => {
      const candidateTarget = projectMemberNotificationTarget(candidate.payloadJson);
      if (!candidateTarget) return false;
      if (target.recordId) return candidateTarget.recordId === target.recordId;
      return candidateTarget.projectId === target.projectId && candidateTarget.employeeId === target.employeeId;
    })
    .map((candidate) => candidate.id);

  return okCommand({ action, notificationIds, recordId: member?.id ?? null, changeUid: target.changeUid });
}
