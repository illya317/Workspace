import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import {
  findEmployeeForUser,
  findProjectMemberFromNotification,
  findProjectMemberNotification,
  listPendingProjectMemberNotifications,
} from "../project-member-notification-reference-adapter";

export interface ProjectMemberNotificationResponseCommand {
  action: "acknowledge" | "reject";
  notificationIds: number[];
  recordId: number | null;
  changeUid: string | null;
}

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
  const notification = await findProjectMemberNotification(userId, notificationId);
  if (!notification) return failCommand("项目邀请不存在", 404);
  if (notification.acknowledgedAt || notification.rejectedAt) return failCommand("项目邀请已处理", 409);

  const target = projectMemberNotificationTarget(notification.payloadJson);
  if (!target) return failCommand("项目邀请数据无效", 409);
  const employee = await findEmployeeForUser(target.employeeId, userId);
  if (!employee) return failCommand("只能处理自己的项目邀请", 403);

  const member = await findProjectMemberFromNotification({
    recordId: target.recordId,
    employeeId: target.employeeId,
    projectId: target.projectId,
  });
  if (action === "acknowledge" && (!member || member.recordState !== "confirmed")) return failCommand("项目邀请已失效", 409);

  const pendingNotifications = await listPendingProjectMemberNotifications(userId);
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
