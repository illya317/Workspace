import {
  baseNotificationWhere,
  buildNotificationSqlWhere,
  buildNotificationWhere,
  deriveWorkflowNotification,
  normalizeNotificationQuery,
  parsePayloadRecord,
  type ListUserNotificationsOptions,
  type NotificationCategory,
  type WorkflowFlowType,
  type WorkflowNotificationRole,
} from "./notification-workflow";
import { listWorkflowCategoryRegistrations } from "../workflow-category-registry";
import { prisma, type Prisma } from "./prisma";
import { permissionReviewNotificationDefinition, type PermissionReviewAlertPayload } from "./notification-permission-review";
import { dataQualityNotificationDefinition, type DataQualityAlertPayload } from "./notification-data-quality";
import type { ProjectMemberNotificationPayload } from "./notification-project-members";
import {
  isWorkflowTodoProviderHandled,
  listWorkflowTodoProviderItems,
} from "./workflow-todo-providers";
import {
  approvalActionKeysForNotifications,
  listOriginatedWorkflowRequestItems,
  toNotificationDto,
  toProviderWorkflowTodoDto,
} from "./workflow-inbox-records";
import { respondToRegisteredNotificationAction } from "./notification-action-providers";
export type {
  ListUserNotificationsOptions,
  NotificationCategory,
  NotificationFilter,
  WorkflowFlowType,
  WorkflowNotificationRole,
  WorkflowStatus,
} from "./notification-workflow";

export type NotificationAction = "read" | "acknowledge" | "reject" | "clear";

type DepartmentCollaborationInvitationPayload = {
  collaborationId: number;
  departmentId: number;
  collaborationTitle: string;
  responsibleDepartmentName: string;
};

export type ApprovalNotificationPayload = {
  requestId: number;
  title: string;
  summary: string;
  href: string;
  eventType: string;
  status: string;
  resourceKey: string;
  businessActionKey: string;
  scopeId?: string | null;
  flowType?: WorkflowFlowType;
  workflowRole?: WorkflowNotificationRole;
  submitterUserId?: number | null;
};

type NotificationPayloadByType = {
  "work.project.member.added": ProjectMemberNotificationPayload;
  "work.project.member.roleChanged": ProjectMemberNotificationPayload;
  "work.department.collaboration.invited": DepartmentCollaborationInvitationPayload;
  "approval.request.submitted": ApprovalNotificationPayload;
  "approval.request.rejected": ApprovalNotificationPayload;
  "approval.request.approved": ApprovalNotificationPayload;
  "approval.request.commented": ApprovalNotificationPayload;
  "security.permissionReview.alert": PermissionReviewAlertPayload;
  "platform.dataQuality.alert": DataQualityAlertPayload;
};
export type RegisteredNotificationType = keyof NotificationPayloadByType;
type NotificationRenderResult = {
  title: string;
  body: string;
  href?: string | null;
  payload?: unknown;
};

type NotificationDefinition<TPayload> = {
  type: RegisteredNotificationType;
  description: string;
  category?: Exclude<NotificationCategory, "all">;
  flowType?: WorkflowFlowType;
  isImportant?: boolean;
  isStrongReminder?: boolean;
  requiresAcknowledgement?: boolean;
  render: (payload: TPayload) => NotificationRenderResult;
};

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

export type SendNotificationInput<TType extends RegisteredNotificationType = RegisteredNotificationType> = {
  recipientUserId: number;
  actorUserId?: number | null;
  type: TType;
  payload: NotificationPayloadByType[TType];
  isImportant?: boolean;
  isStrongReminder?: boolean;
  requiresAcknowledgement?: boolean;
};

const WORKFLOW_COPY = {
  approval: {
    todo: "有新的审批待处理",
    rejected: "审批已驳回",
    approved: "审批已通过",
    commented: "审批有新评论",
  },
  review: {
    todo: "有新的复核待处理",
    rejected: "复核已驳回",
    approved: "复核已通过",
    commented: "复核有新评论",
  },
  publish: {
    todo: "有新的发布待处理",
    rejected: "发布已驳回",
    approved: "发布已通过",
    commented: "发布有新评论",
  },
} as const satisfies Record<WorkflowFlowType, Record<"todo" | "rejected" | "approved" | "commented", string>>;

const notificationRegistry = {
  "work.department.collaboration.invited": defineNotification<DepartmentCollaborationInvitationPayload>({
    type: "work.department.collaboration.invited",
    description: "负责部门发起固定部门协作时提醒赋能部门响应",
    isImportant: true,
    requiresAcknowledgement: true,
    render: (payload) => ({
      title: "部门协作待响应",
      body: `${payload.responsibleDepartmentName} 邀请你所在部门参与「${payload.collaborationTitle}」。`,
      href: `/work/department/${payload.departmentId}/space?view=collaboration&collaborationId=${payload.collaborationId}`,
      payload,
    }),
  }),
  "work.project.member.added": defineNotification<ProjectMemberNotificationPayload>({
    type: "work.project.member.added",
    description: "员工被加入项目时提醒本人确认",
    isImportant: true,
    render: (payload) => ({
      title: "项目邀请",
      body: `${payload.inviterName} 邀请你加入「${payload.projectName}」，RASCI 职责：${payload.role}。`,
      href: `/work/project/${payload.projectId}`,
      payload,
    }),
  }),
  "work.project.member.roleChanged": defineNotification<ProjectMemberNotificationPayload>({
    type: "work.project.member.roleChanged",
    description: "员工项目角色调整时提醒本人确认",
    isImportant: true,
    render: (payload) => ({
      title: "项目角色已调整",
      body: `${payload.inviterName} 将你在「${payload.projectName}」中的 RASCI 职责由「${payload.changedFromRole || "未设置"}」调整为「${payload.role}」。`,
      href: `/work/project/${payload.projectId}`,
      payload,
    }),
  }),
  "approval.request.submitted": defineNotification<ApprovalNotificationPayload>({
    type: "approval.request.submitted",
    description: "通用审批单提交后提醒审批人处理",
    category: "workflow",
    isImportant: true,
    requiresAcknowledgement: false,
    render: (payload) => ({
      title: workflowCopy(payload, "todo"),
      body: `${payload.title}：${payload.summary}`,
      href: payload.href,
      payload,
    }),
  }),
  "approval.request.rejected": defineNotification<ApprovalNotificationPayload>({
    type: "approval.request.rejected",
    description: "通用审批单被驳回后提醒发起人",
    category: "workflow",
    isImportant: true,
    requiresAcknowledgement: false,
    render: (payload) => ({
      title: workflowCopy(payload, "rejected"),
      body: `${payload.title}：${payload.summary}`,
      href: payload.href,
      payload,
    }),
  }),
  "approval.request.approved": defineNotification<ApprovalNotificationPayload>({
    type: "approval.request.approved",
    description: "通用审批单通过后提醒发起人",
    category: "workflow",
    requiresAcknowledgement: false,
    render: (payload) => ({
      title: workflowCopy(payload, "approved"),
      body: `${payload.title}：${payload.summary}`,
      href: payload.href,
      payload,
    }),
  }),
  "approval.request.commented": defineNotification<ApprovalNotificationPayload>({
    type: "approval.request.commented",
    description: "通用审批单新增评论后提醒相关人",
    category: "workflow",
    requiresAcknowledgement: false,
    render: (payload) => ({
      title: workflowCopy(payload, "commented"),
      body: `${payload.title}：${payload.summary}`,
      href: payload.href,
      payload,
    }),
  }),
  "security.permissionReview.alert": defineNotification<PermissionReviewAlertPayload>(permissionReviewNotificationDefinition),
  "platform.dataQuality.alert": defineNotification<DataQualityAlertPayload>(dataQualityNotificationDefinition),
} satisfies { [TType in RegisteredNotificationType]: NotificationDefinition<NotificationPayloadByType[TType]> };

function defineNotification<TPayload>(definition: NotificationDefinition<TPayload>) {
  return definition;
}

function workflowCopy(payload: ApprovalNotificationPayload, key: "todo" | "rejected" | "approved" | "commented") {
  return WORKFLOW_COPY[payload.flowType ?? "approval"][key];
}

export function listRegisteredNotificationTypes() {
  return Object.values(notificationRegistry).map((definition) => ({
    type: definition.type,
    description: definition.description,
    category: definition.category ?? "ordinary",
    flowType: definition.flowType ?? null,
    isImportant: definition.isImportant ?? false,
    isStrongReminder: definition.isStrongReminder ?? false,
    requiresAcknowledgement: definition.requiresAcknowledgement ?? definition.isImportant ?? false,
  }));
}

export async function sendNotification<TType extends RegisteredNotificationType>(input: SendNotificationInput<TType>, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const definition = notificationRegistry[input.type] as NotificationDefinition<NotificationPayloadByType[TType]> | undefined;
  if (!definition) throw new Error(`Notification type is not registered: ${input.type}`);
  const rendered = definition.render(input.payload);
  return createNotification({
    recipientUserId: input.recipientUserId,
    actorUserId: input.actorUserId,
    type: input.type,
    title: rendered.title,
    body: rendered.body,
    href: rendered.href,
    payload: rendered.payload ?? input.payload,
    isImportant: input.isImportant ?? definition.isImportant,
    isStrongReminder: input.isStrongReminder ?? definition.isStrongReminder,
    requiresAcknowledgement: input.requiresAcknowledgement ?? definition.requiresAcknowledgement,
  }, client);
}

export async function createNotification(input: CreateNotificationInput, client: Prisma.TransactionClient | typeof prisma = prisma) {
  if (input.actorUserId && input.actorUserId === input.recipientUserId) return null;
  return client.notification.create({
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
