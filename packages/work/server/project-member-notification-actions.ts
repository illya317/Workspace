import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import {
  registerNotificationActionProvider,
  type NotificationActionResult,
} from "@workspace/platform/server/notification-action-providers";
import { prisma } from "@workspace/platform/server/prisma";
import { buildProjectMemberNotificationResponseCommand } from "./domain/project-member-notification-validation";

const PROJECT_MEMBER_NOTIFICATION_TYPES = new Set([
  "work.project.member.added",
  "work.project.member.roleChanged",
]);

let registered = false;

export function registerWorkProjectMemberNotificationActionProvider() {
  if (registered) return;
  registerNotificationActionProvider({
    handles: (notificationType) => PROJECT_MEMBER_NOTIFICATION_TYPES.has(notificationType),
    respond: respondToProjectMemberNotification,
  });
  registered = true;
}

async function respondToProjectMemberNotification(input: {
  userId: number;
  notificationId: number;
  action: "acknowledge" | "reject";
}): Promise<NotificationActionResult> {
  const command = await buildProjectMemberNotificationResponseCommand(
    input.userId,
    input.notificationId,
    input.action,
  );
  if (!command.ok) {
    return {
      success: false,
      error: command.issue.message,
      status: command.issue.status ?? 400,
    };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (command.data.action === "reject" && command.data.recordId) {
      await ensureEditHistoryBaseline("EmployeeProject", command.data.recordId, input.userId, tx);
      await snapshotHistory("EmployeeProject", command.data.recordId, input.userId, tx);
      await tx.employeeProject.delete({ where: { id: command.data.recordId } });
    }
    await tx.notification.updateMany({
      where: { id: { in: command.data.notificationIds }, recipientUserId: input.userId },
      data: command.data.action === "reject"
        ? { readAt: now, acknowledgedAt: null, rejectedAt: now }
        : { readAt: now, acknowledgedAt: now, rejectedAt: null },
    });
  });
  return { success: true };
}
