import {
  registerNotificationActionProvider,
  type NotificationActionResult,
} from "@workspace/platform/server/notification-action-providers";
import { prisma } from "@workspace/platform/server/prisma";
import { respondDepartmentCollaboration } from "./department-collaborations";

const COLLABORATION_NOTIFICATION_TYPE = "work.department.collaboration.invited";

let registered = false;

export function registerWorkDepartmentCollaborationNotificationActionProvider() {
  if (registered) return;
  registerNotificationActionProvider({
    handles: (notificationType) => notificationType === COLLABORATION_NOTIFICATION_TYPE,
    respond: respondToDepartmentCollaborationNotification,
  });
  registered = true;
}

async function respondToDepartmentCollaborationNotification(input: {
  userId: number;
  notificationId: number;
  action: "acknowledge" | "reject";
}): Promise<NotificationActionResult> {
  const notification = await prisma.notification.findFirst({
    where: { id: input.notificationId, recipientUserId: input.userId, type: COLLABORATION_NOTIFICATION_TYPE },
    select: { payloadJson: true, acknowledgedAt: true, rejectedAt: true },
  });
  if (!notification) return { success: false, error: "协作邀请不存在", status: 404 };
  if (notification.acknowledgedAt || notification.rejectedAt) return { success: false, error: "协作邀请已处理", status: 409 };
  const payload = parsePayload(notification.payloadJson);
  if (!payload) return { success: false, error: "协作邀请数据无效", status: 409 };
  const result = await respondDepartmentCollaboration({
    userId: input.userId,
    collaborationId: payload.collaborationId,
    departmentId: payload.departmentId,
    action: input.action === "acknowledge" ? "accept" : "reject",
  });
  return result.ok
    ? { success: true }
    : { success: false, error: result.error, status: result.status || 400 };
}

function parsePayload(value: string | null) {
  if (!value) return null;
  try {
    const payload = JSON.parse(value) as Record<string, unknown>;
    const collaborationId = Number(payload.collaborationId);
    const departmentId = Number(payload.departmentId);
    return Number.isInteger(collaborationId) && collaborationId > 0 && Number.isInteger(departmentId) && departmentId > 0
      ? { collaborationId, departmentId }
      : null;
  } catch {
    return null;
  }
}
