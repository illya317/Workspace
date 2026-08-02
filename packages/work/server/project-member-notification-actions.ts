import {
  registerNotificationActionProvider,
  type NotificationActionResult,
} from "@workspace/platform/server/notification-action-providers";
import { prisma } from "@workspace/platform/server/prisma";
import { buildProjectMemberNotificationResponseCommand } from "./domain/project-member-notification-validation";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { rejectProjectMembershipInTransaction } from "./project-membership-lifecycle-service";

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
      await rejectProjectMembershipInTransaction(tx, {
        recordId: command.data.recordId,
        effectiveOn: workspaceBusinessDate(now),
        reason: "成员拒绝项目邀请或角色变更",
        userId: input.userId,
        idempotencyKey: `project-membership-notification-reject:${input.notificationId}`,
      });
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
