import { prisma } from "./prisma";
import { snapshotHistory } from "./history";

export type NotificationAction = "read" | "acknowledge" | "reject" | "clear";

export interface CreateNotificationInput {
  recipientUserId: number;
  actorUserId?: number | null;
  type: string;
  title: string;
  body: string;
  href?: string | null;
  payload?: unknown;
  isImportant?: boolean;
}

export async function createNotification(input: CreateNotificationInput) {
  if (input.actorUserId && input.actorUserId === input.recipientUserId) return null;
  return prisma.notification.create({
    data: {
      recipientUserId: input.recipientUserId,
      actorUserId: input.actorUserId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      payloadJson: input.payload === undefined ? null : JSON.stringify(input.payload),
      isImportant: input.isImportant ?? false,
    },
  });
}

function parseNotificationPayload(payloadJson: string | null) {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function listUserNotifications(userId: number, limit = 5, offset = 0) {
  const take = Math.min(Math.max(limit, 1), 50);
  const skip = Math.max(offset, 0);
  const visibleWhere = { recipientUserId: userId, clearedAt: null };
  const [items, total, unreadCount, pendingCount] = await Promise.all([
    prisma.notification.findMany({
      where: visibleWhere,
      include: { actor: { select: { id: true, nickname: true, username: true, avatar: true } } },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.notification.count({ where: visibleWhere }),
    prisma.notification.count({ where: { ...visibleWhere, readAt: null } }),
    prisma.notification.count({ where: { ...visibleWhere, isImportant: true, acknowledgedAt: null, rejectedAt: null } }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      body: item.body,
      href: item.href,
      isImportant: item.isImportant,
      readAt: item.readAt?.toISOString() ?? null,
      acknowledgedAt: item.acknowledgedAt?.toISOString() ?? null,
      rejectedAt: item.rejectedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      actor: item.actor
        ? {
            id: item.actor.id,
            name: item.actor.nickname || item.actor.username || "系统用户",
            avatar: item.actor.avatar,
          }
        : null,
    })),
    total,
    hasMore: skip + items.length < total,
    unreadCount,
    pendingCount,
  };
}

async function rejectProjectMemberNotification(userId: number, notificationId: number) {
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      recipientUserId: userId,
      type: { in: ["work.project.member.added", "work.project.member.roleChanged"] },
    },
    select: { id: true, payloadJson: true },
  });
  if (!notification) return { success: false as const, error: "通知不存在", status: 404 };

  const payload = parseNotificationPayload(notification.payloadJson);
  const projectId = Number(payload?.projectId);
  const employeeId = Number(payload?.employeeId);
  if (!Number.isInteger(projectId) || !Number.isInteger(employeeId)) {
    return { success: false as const, error: "通知数据无效", status: 400 };
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, userId },
    select: { id: true },
  });
  if (!employee) return { success: false as const, error: "只能拒绝自己的项目邀请", status: 403 };

  const member = await prisma.employeeProject.findUnique({
    where: { employeeId_projectId: { employeeId, projectId } },
    select: { id: true },
  });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (member) {
      await snapshotHistory("EmployeeProject", member.id, userId, tx);
      await tx.employeeProject.delete({ where: { id: member.id } });
    }
    await tx.notification.update({
      where: { id: notificationId },
      data: { readAt: now, rejectedAt: now },
    });
  });
  return { success: true as const };
}

export async function updateUserNotification(userId: number, notificationId: number, action: NotificationAction) {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, recipientUserId: userId },
    select: { id: true },
  });
  if (!existing) return { success: false as const, error: "通知不存在", status: 404 };

  const now = new Date();
  if (action === "reject") return rejectProjectMemberNotification(userId, notificationId);

  await prisma.notification.update({
    where: { id: notificationId },
    data: action === "clear"
      ? { readAt: now, clearedAt: now }
      : action === "acknowledge"
        ? { readAt: now, acknowledgedAt: now, rejectedAt: null }
        : { readAt: now },
  });
  return { success: true as const };
}

export async function clearReadUserNotifications(userId: number) {
  const now = new Date();
  const result = await prisma.notification.updateMany({
    where: {
      recipientUserId: userId,
      clearedAt: null,
      readAt: { not: null },
      isImportant: false,
    },
    data: { clearedAt: now },
  });
  return { success: true as const, count: result.count };
}

export async function markAllUserNotificationsRead(userId: number) {
  const now = new Date();
  const result = await prisma.notification.updateMany({
    where: { recipientUserId: userId, clearedAt: null, readAt: null },
    data: { readAt: now },
  });
  return { success: true as const, count: result.count };
}
