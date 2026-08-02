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
} from "./workflow-inbox-records";
import { toNotificationDto, toProviderWorkflowTodoDto } from "./workflow-inbox-projection";
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
  const focusRequestId = Number.isInteger(options.workflowRequestId) && Number(options.workflowRequestId) > 0
    ? Number(options.workflowRequestId)
    : null;
  const query = normalizeNotificationQuery(options);
  if (query.filter === "todo" && query.category !== "ordinary") {
    return listActiveWorkflowTodoNotifications(userId, take, skip, focusRequestId);
  }
  if (query.filter === "originated" && query.category !== "ordinary") {
    return listOriginatedWorkflowRequests(userId, take, skip, query.category);
  }
  const visibleWhere = buildNotificationWhere(userId, query);
  const visibleAllWhere = baseNotificationWhere(userId);
  const [orderedIds, total, unreadCount, pendingCount, ordinaryCount, ordinaryUnreadCount, workflowTodoCount, workflowMineCount] = await Promise.all([
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
    prisma.notification.count({ where: buildNotificationWhere(userId, { category: "ordinary", filter: "all", readState: "unread" }) }),
    listActiveWorkflowTodoItems(userId).then((items) => items.length),
    prisma.approvalRequest.count({ where: { submitterUserId: userId } }),
  ]);
  const itemIds = orderedIds.map((item) => item.id);
  const itemOrder = new Map(itemIds.map((id, index) => [id, index]));
  const items = itemIds.length === 0
    ? []
    : (await prisma.notification.findMany({
        where: { id: { in: itemIds } },
        include: {
          actor: { select: { id: true, avatar: true, employees: { select: { name: true }, take: 1 } } },
          dispatch: { select: { id: true, sourceKind: true, sourceLabel: true, definitionKey: true, definitionRevision: true } },
        },
      })).sort((a, b) => (itemOrder.get(a.id) ?? 0) - (itemOrder.get(b.id) ?? 0));

  const actionKeysByRequestId = await approvalActionKeysForNotifications(items);
  return {
    items: items.map((item) => toNotificationDto(item, userId, actionKeysByRequestId)),
    total,
    hasMore: skip + items.length < total,
    unreadCount,
    pendingCount,
    attentionCount: ordinaryUnreadCount + workflowTodoCount,
    tabCounts: {
      ordinary: ordinaryCount,
      workflowTodo: workflowTodoCount,
      workflowMine: workflowMineCount,
    },
    workflowCategories: listWorkflowCategoryRegistrations(),
  };
}

async function listActiveWorkflowTodoNotifications(
  userId: number,
  take: number,
  skip: number,
  focusRequestId: number | null,
) {
  const visibleAllWhere = baseNotificationWhere(userId);
  const [activeItems, unreadCount, pendingCount, ordinaryCount, ordinaryUnreadCount, workflowMineCount] = await Promise.all([
    listActiveWorkflowTodoItems(userId),
    prisma.notification.count({ where: { ...visibleAllWhere, readAt: null } }),
    prisma.notification.count({ where: { ...visibleAllWhere, requiresAcknowledgement: true, acknowledgedAt: null, rejectedAt: null } }),
    prisma.notification.count({ where: buildNotificationWhere(userId, { category: "ordinary", filter: "all" }) }),
    prisma.notification.count({ where: buildNotificationWhere(userId, { category: "ordinary", filter: "all", readState: "unread" }) }),
    prisma.approvalRequest.count({ where: { submitterUserId: userId } }),
  ]);
  const orderedItems = prioritizeWorkflowRequest(activeItems, focusRequestId);
  const pagedItems = orderedItems.slice(skip, skip + take);
  return {
    items: pagedItems,
    total: activeItems.length,
    hasMore: skip + pagedItems.length < activeItems.length,
    unreadCount,
    pendingCount,
    attentionCount: ordinaryUnreadCount + activeItems.length,
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
  const [originated, ordinaryCount, ordinaryUnreadCount, workflowTodoCount, pendingCount] = await Promise.all([
    listOriginatedWorkflowRequestItems(userId, take, skip, category),
    prisma.notification.count({ where: buildNotificationWhere(userId, { category: "ordinary", filter: "all" }) }),
    prisma.notification.count({ where: buildNotificationWhere(userId, { category: "ordinary", filter: "all", readState: "unread" }) }),
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
    attentionCount: ordinaryUnreadCount + workflowTodoCount,
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

function prioritizeWorkflowRequest<T extends { workflow?: { requestId?: number | null } | null }>(
  items: T[],
  requestId: number | null,
) {
  if (!requestId) return items;
  const index = items.findIndex((item) => item.workflow?.requestId === requestId);
  return index <= 0 ? items : [items[index]!, ...items.slice(0, index), ...items.slice(index + 1)];
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
        include: {
          actor: { select: { id: true, avatar: true, employees: { select: { name: true }, take: 1 } } },
          dispatch: { select: { id: true, sourceKind: true, sourceLabel: true, definitionKey: true, definitionRevision: true } },
        },
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
    select: {
      id: true,
      type: true,
      responseMode: true,
      requiresAcknowledgement: true,
      acknowledgedAt: true,
      rejectedAt: true,
    },
  });
  if (!existing) return { success: false as const, error: "通知不存在", status: 404 };

  const responseMode = existing.responseMode === "accept_reject"
    ? "accept_reject"
    : existing.responseMode === "acknowledge" ? "acknowledge" : "read";
  if (action === "acknowledge" && responseMode === "read") {
    return { success: false as const, error: "该通知无需确认", status: 409 };
  }
  if (action === "reject" && responseMode !== "accept_reject") {
    return { success: false as const, error: "该通知不支持拒绝", status: 409 };
  }
  if (
    action === "clear"
    && (existing.requiresAcknowledgement || responseMode !== "read")
    && !existing.acknowledgedAt
    && !existing.rejectedAt
  ) {
    return { success: false as const, error: "待响应通知不能清除，请先完成响应", status: 409 };
  }

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
