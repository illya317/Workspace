import {
  baseNotificationWhere,
  buildNotificationSqlWhere,
  buildNotificationWhere,
  deriveWorkflowNotification,
  normalizeNotificationQuery,
  parsePayloadRecord,
  type ListUserNotificationsOptions,
  type NotificationCategory,
} from "./notification-workflow";
import { listWorkflowCategoryRegistrations } from "../workflow-category-registry";
import { respondToRegisteredNotificationAction } from "./notification-action-providers";
import { prisma } from "./prisma";
import {
  approvalActionKeysForNotifications,
  listOriginatedWorkflowRequestItems,
  toNotificationDto,
  toProviderWorkflowTodoDto,
} from "./workflow-inbox-records";
import {
  isWorkflowTodoProviderHandled,
  listWorkflowTodoProviderItems,
} from "./workflow-todo-providers";

export type NotificationAction = "read" | "acknowledge" | "reject" | "clear";

export async function listUserNotifications(
  userId: number,
  limitOrOptions: number | ListUserNotificationsOptions = 5,
  offset = 0,
) {
  const options = typeof limitOrOptions === "number" ? { limit: limitOrOptions, offset } : limitOrOptions;
  const take = Math.min(Math.max(options.limit ?? 5, 1), 50);
  const skip = Math.max(options.offset ?? 0, 0);
  const query = normalizeNotificationQuery(options);
  if (query.filter === "todo" && query.category !== "ordinary") {
    return listActiveWorkflowTodoNotifications(userId, take, skip);
  }
  if (query.filter === "originated" && query.category !== "ordinary") {
    return listOriginatedWorkflowRequests(userId, take, skip, query.category);
  }
  const visibleWhere = buildNotificationWhere(userId, query);
  const visibleAllWhere = baseNotificationWhere(userId);
  const [orderedIds, total, unreadCount, pendingCount, ordinaryCount, workflowTodoCount, workflowMineCount] = await Promise.all([
    prisma.$queryRaw<{ id: number }[]>`
      SELECT "id"
      FROM "Notification"
      WHERE ${buildNotificationSqlWhere(userId, query)}
      ORDER BY
        CASE
          WHEN "requiresAcknowledgement" IS TRUE AND "acknowledgedAt" IS NULL AND "rejectedAt" IS NULL THEN 0
          WHEN "isImportant" IS TRUE AND "readAt" IS NULL THEN 1
          ELSE 2
        END ASC,
        "createdAt" DESC
      LIMIT ${take}
      OFFSET ${skip}
    `,
    prisma.notification.count({ where: visibleWhere }),
    prisma.notification.count({ where: { ...visibleAllWhere, readAt: null } }),
    prisma.notification.count({ where: { ...visibleAllWhere, requiresAcknowledgement: true, acknowledgedAt: null, rejectedAt: null } }),
    prisma.notification.count({ where: buildNotificationWhere(userId, { category: "ordinary", filter: "all" }) }),
    listActiveWorkflowTodoItems(userId).then((items) => items.length),
    prisma.approvalRequest.count({ where: { submitterUserId: userId } }),
  ]);
  const itemIds = orderedIds.map((item) => item.id);
  const itemOrder = new Map(itemIds.map((id, index) => [id, index]));
  const items = itemIds.length === 0
    ? []
    : (await prisma.notification.findMany({
        where: { id: { in: itemIds } },
        include: { actor: { select: { id: true, avatar: true, employees: { select: { name: true }, take: 1 } } } },
      })).sort((a, b) => (itemOrder.get(a.id) ?? 0) - (itemOrder.get(b.id) ?? 0));

  const actionKeysByRequestId = await approvalActionKeysForNotifications(items);
  return {
    items: items.map((item) => toNotificationDto(item, userId, actionKeysByRequestId)),
    total,
    hasMore: skip + items.length < total,
    unreadCount,
    pendingCount,
    tabCounts: {
      ordinary: ordinaryCount,
      workflowTodo: workflowTodoCount,
      workflowMine: workflowMineCount,
    },
    workflowCategories: listWorkflowCategoryRegistrations(),
  };
}

async function listActiveWorkflowTodoNotifications(userId: number, take: number, skip: number) {
  const visibleAllWhere = baseNotificationWhere(userId);
  const [activeItems, unreadCount, pendingCount, ordinaryCount, workflowMineCount] = await Promise.all([
    listActiveWorkflowTodoItems(userId),
    prisma.notification.count({ where: { ...visibleAllWhere, readAt: null } }),
    prisma.notification.count({ where: { ...visibleAllWhere, requiresAcknowledgement: true, acknowledgedAt: null, rejectedAt: null } }),
    prisma.notification.count({ where: buildNotificationWhere(userId, { category: "ordinary", filter: "all" }) }),
    prisma.approvalRequest.count({ where: { submitterUserId: userId } }),
  ]);
  const pagedItems = activeItems.slice(skip, skip + take);
  return {
    items: pagedItems,
    total: activeItems.length,
    hasMore: skip + pagedItems.length < activeItems.length,
    unreadCount,
    pendingCount,
    tabCounts: {
      ordinary: ordinaryCount,
      workflowTodo: activeItems.length,
      workflowMine: workflowMineCount,
    },
    workflowCategories: listWorkflowCategoryRegistrations(),
  };
}

async function listOriginatedWorkflowRequests(
  userId: number,
  take: number,
  skip: number,
  category: NotificationCategory,
) {
  const visibleAllWhere = baseNotificationWhere(userId);
  const [originated, ordinaryCount, workflowTodoCount, pendingCount] = await Promise.all([
    listOriginatedWorkflowRequestItems(userId, take, skip, category),
    prisma.notification.count({ where: buildNotificationWhere(userId, { category: "ordinary", filter: "all" }) }),
    listActiveWorkflowTodoItems(userId).then((items) => items.length),
    prisma.notification.count({
      where: { ...visibleAllWhere, requiresAcknowledgement: true, acknowledgedAt: null, rejectedAt: null },
    }),
  ]);
  return {
    items: originated.items,
    total: originated.total,
    hasMore: skip + originated.items.length < originated.total,
    unreadCount: 0,
    pendingCount,
    tabCounts: {
      ordinary: ordinaryCount,
      workflowTodo: workflowTodoCount,
      workflowMine: originated.total,
    },
    workflowCategories: listWorkflowCategoryRegistrations(),
  };
}

async function listActiveWorkflowTodoItems(userId: number) {
  const [notificationItems, providerItems] = await Promise.all([
    listActiveWorkflowTodoNotificationItems(userId),
    listProviderWorkflowTodoItems(userId),
  ]);
  const providerRequestIds = new Set(providerItems.map((item) => item.workflow?.requestId).filter((id): id is number => Number.isInteger(id)));
  const seen = new Set<string>();
  const items: ReturnType<typeof toNotificationDto>[] = [];
  for (const item of [...notificationItems, ...providerItems]) {
    const requestId = item.workflow?.requestId;
    if (requestId && item.id > 0 && isWorkflowTodoProviderHandled({
      requestId,
      resourceKey: item.workflow?.resourceKey ?? null,
      scopeId: item.workflow?.scopeId ?? null,
    }) && !providerRequestIds.has(requestId)) continue;
    const key = requestId ? `request:${requestId}` : `notification:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function listActiveWorkflowTodoNotificationItems(userId: number) {
  const candidates = await prisma.notification.findMany({
    where: buildNotificationWhere(userId, { category: "workflow", filter: "todo" }),
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      href: true,
      payloadJson: true,
    },
    orderBy: [{ isImportant: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const requestIds = candidates
    .map((item) => numberFromUnknown(parsePayloadRecord(item.payloadJson).requestId))
    .filter((id): id is number => Number.isInteger(id));
  const submittedRequests = requestIds.length
    ? await prisma.approvalRequest.findMany({
        where: { id: { in: requestIds }, status: "submitted" },
        select: { id: true, businessActionKey: true },
      })
    : [];
  const submittedIds = new Set(submittedRequests.map((item) => item.id));
  const actionKeysByRequestId = new Map(submittedRequests.map((item) => [item.id, item.businessActionKey]));
  const workflows = candidates.map((item) => {
    const payload = parsePayloadRecord(item.payloadJson);
    const requestId = numberFromUnknown(payload.requestId);
    return {
      id: item.id,
      workflow: deriveWorkflowNotification(item, payload, userId, requestId ? actionKeysByRequestId.get(requestId) : null),
    };
  });
  const seen = new Set<string>();
  const activeIds: number[] = [];
  for (const item of workflows) {
    const requestId = item.workflow?.requestId;
    if (requestId && !submittedIds.has(requestId)) continue;
    const key = requestId ? `request:${requestId}` : `notification:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    activeIds.push(item.id);
  }
  const itemOrder = new Map(activeIds.map((id, index) => [id, index]));
  return activeIds.length === 0
    ? []
    : (await prisma.notification.findMany({
        where: { id: { in: activeIds } },
        include: { actor: { select: { id: true, avatar: true, employees: { select: { name: true }, take: 1 } } } },
      }))
        .sort((a, b) => (itemOrder.get(a.id) ?? 0) - (itemOrder.get(b.id) ?? 0))
        .map((item) => toNotificationDto(item, userId, actionKeysByRequestId));
}

async function listProviderWorkflowTodoItems(userId: number) {
  return (await listWorkflowTodoProviderItems(userId)).map(toProviderWorkflowTodoDto);
}

export async function updateUserNotification(userId: number, notificationId: number, action: NotificationAction) {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, recipientUserId: userId },
    select: { id: true, type: true },
  });
  if (!existing) return { success: false as const, error: "通知不存在", status: 404 };

  if (action === "acknowledge" || action === "reject") {
    const handled = await respondToRegisteredNotificationAction({
      notificationType: existing.type,
      userId,
      notificationId,
      action,
    });
    if (handled) return handled;
  }

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

export async function clearReadUserNotifications(userId: number, options: Pick<ListUserNotificationsOptions, "category" | "filter"> = {}) {
  const now = new Date();
  const result = await prisma.notification.updateMany({
    where: {
      ...buildNotificationWhere(userId, normalizeNotificationQuery(options)),
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

export async function markAllUserNotificationsRead(userId: number, options: Pick<ListUserNotificationsOptions, "category" | "filter"> = {}) {
  const now = new Date();
  const result = await prisma.notification.updateMany({
    where: { ...buildNotificationWhere(userId, normalizeNotificationQuery(options)), readAt: null },
    data: { readAt: now },
  });
  return { success: true as const, count: result.count };
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
