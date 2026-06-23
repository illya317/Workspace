import { prisma } from "./prisma";

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
  isStrongReminder?: boolean;
  requiresAcknowledgement?: boolean;
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
      isStrongReminder: input.isStrongReminder ?? false,
      requiresAcknowledgement: input.requiresAcknowledgement ?? input.isImportant ?? false,
    },
  });
}

export async function listUserNotifications(userId: number, limit = 5, offset = 0) {
  const take = Math.min(Math.max(limit, 1), 50);
  const skip = Math.max(offset, 0);
  const visibleWhere = { recipientUserId: userId, clearedAt: null };
  const [orderedIds, total, unreadCount, pendingCount] = await Promise.all([
    prisma.$queryRaw<{ id: number }[]>`
      SELECT id
      FROM Notification
      WHERE recipientUserId = ${userId}
        AND clearedAt IS NULL
      ORDER BY
        CASE
          WHEN requiresAcknowledgement = 1 AND acknowledgedAt IS NULL AND rejectedAt IS NULL THEN 0
          WHEN isImportant = 1 AND readAt IS NULL THEN 1
          ELSE 2
        END ASC,
        createdAt DESC
      LIMIT ${take}
      OFFSET ${skip}
    `,
    prisma.notification.count({ where: visibleWhere }),
    prisma.notification.count({ where: { ...visibleWhere, readAt: null } }),
    prisma.notification.count({ where: { ...visibleWhere, requiresAcknowledgement: true, acknowledgedAt: null, rejectedAt: null } }),
  ]);
  const itemIds = orderedIds.map((item) => item.id);
  const itemOrder = new Map(itemIds.map((id, index) => [id, index]));
  const items = itemIds.length === 0
    ? []
    : (await prisma.notification.findMany({
        where: { id: { in: itemIds } },
        include: { actor: { select: { id: true, nickname: true, username: true, avatar: true } } },
      })).sort((a, b) => (itemOrder.get(a.id) ?? 0) - (itemOrder.get(b.id) ?? 0));

  return {
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      body: item.body,
      href: item.href,
      isImportant: item.isImportant,
      isStrongReminder: item.isStrongReminder,
      requiresAcknowledgement: item.requiresAcknowledgement,
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

export async function updateUserNotification(userId: number, notificationId: number, action: NotificationAction) {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, recipientUserId: userId },
    select: { id: true },
  });
  if (!existing) return { success: false as const, error: "通知不存在", status: 404 };

  const now = new Date();

  await prisma.notification.update({
    where: { id: notificationId },
    data: action === "clear"
      ? { readAt: now, clearedAt: now }
      : action === "acknowledge"
        ? { readAt: now, acknowledgedAt: now, rejectedAt: null }
        : action === "reject"
          ? { readAt: now, acknowledgedAt: null, rejectedAt: now }
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
      OR: [
        { requiresAcknowledgement: false },
        { acknowledgedAt: { not: null } },
        { rejectedAt: { not: null } },
      ],
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
