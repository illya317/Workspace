import type {
  NotificationCategory,
  WorkflowFlowType,
  WorkflowNotificationRole,
} from "./notification-workflow";
import { prisma, type Prisma } from "./prisma";
import { permissionReviewNotificationDefinition, type PermissionReviewAlertPayload } from "./notification-permission-review";
import { dataQualityNotificationDefinition, type DataQualityAlertPayload } from "./notification-data-quality";
import type { ProjectMemberNotificationPayload } from "./notification-project-members";
export {
  clearReadUserNotifications,
  listUserNotifications,
  markAllUserNotificationsRead,
  updateUserNotification,
} from "./notification-inbox";
export type { NotificationAction } from "./notification-inbox";
export type {
  ListUserNotificationsOptions,
  NotificationCategory,
  NotificationFilter,
  WorkflowFlowType,
  WorkflowNotificationRole,
  WorkflowStatus,
} from "./notification-workflow";

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

export type NotificationAudienceMode = "assigned" | "governance_required" | "optional";
export type NotificationSubscriptionMode = "required" | "optional";
export type NotificationCatalogGroupKey = "work" | "workflow" | "business" | "security";
export type NotificationChannel = "workspace";
export type NotificationCadence = "immediate";

type NotificationCatalogMetadata<TPayload> = {
  label: string;
  groupKey: NotificationCatalogGroupKey;
  groupLabel: string;
  triggerDescription: string;
  recipientDescription: string;
  audienceMode: NotificationAudienceMode;
  subscriptionMode: NotificationSubscriptionMode;
  ownerResourceKey: string | null;
  supportedChannels: readonly NotificationChannel[];
  defaultChannel: NotificationChannel;
  defaultCadence: NotificationCadence;
  defaultEnabled: boolean;
  details?: readonly string[];
  recipientReason: string | ((payload: TPayload) => string);
  resourceKey?: string | ((payload: TPayload) => string | null);
  scopeId?: string | ((payload: TPayload) => string | null);
};

type NotificationDefinition<TPayload> = NotificationCatalogMetadata<TPayload> & {
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
  recipientReason?: string | null;
  resourceKey?: string | null;
  scopeId?: string | null;
  subscriptionId?: number | null;
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
  deliveryContext?: {
    recipientReason?: string | null;
    resourceKey?: string | null;
    scopeId?: string | null;
    subscriptionId?: number | null;
  };
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
    label: "部门协作邀请",
    description: "负责部门发起固定部门协作时提醒赋能部门响应",
    groupKey: "work",
    groupLabel: "工作与协作",
    triggerDescription: "负责部门发起固定部门协作，并需要你所在部门响应时。",
    recipientDescription: "按协作任务分配、部门负责人或协作责任范围接收。",
    audienceMode: "assigned",
    subscriptionMode: "required",
    ownerResourceKey: "work.tasks",
    supportedChannels: ["workspace"],
    defaultChannel: "workspace",
    defaultCadence: "immediate",
    defaultEnabled: true,
    recipientReason: "你是该部门协作责任范围的成员",
    resourceKey: "work.tasks",
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
    label: "加入项目",
    description: "员工被加入项目时提醒本人确认",
    groupKey: "work",
    groupLabel: "工作与协作",
    triggerDescription: "你被添加为项目成员时。",
    recipientDescription: "直接发送给被添加的项目成员。",
    audienceMode: "assigned",
    subscriptionMode: "required",
    ownerResourceKey: "work.projects",
    supportedChannels: ["workspace"],
    defaultChannel: "workspace",
    defaultCadence: "immediate",
    defaultEnabled: true,
    recipientReason: "你是本次项目成员变更的直接对象",
    resourceKey: "work.projects",
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
    label: "项目角色变更",
    description: "员工项目角色调整时提醒本人确认",
    groupKey: "work",
    groupLabel: "工作与协作",
    triggerDescription: "你在项目中的 RASCI 职责发生变化时。",
    recipientDescription: "直接发送给角色被调整的项目成员。",
    audienceMode: "assigned",
    subscriptionMode: "required",
    ownerResourceKey: "work.projects",
    supportedChannels: ["workspace"],
    defaultChannel: "workspace",
    defaultCadence: "immediate",
    defaultEnabled: true,
    recipientReason: "你是本次项目角色变更的直接对象",
    resourceKey: "work.projects",
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
    label: "流程待处理",
    description: "通用审批单提交后提醒审批人处理",
    groupKey: "workflow",
    groupLabel: "流程待办",
    triggerDescription: "审批、复核或发布流程进入你的处理节点时。",
    recipientDescription: "按流程处理人职责接收。",
    audienceMode: "assigned",
    subscriptionMode: "required",
    ownerResourceKey: null,
    supportedChannels: ["workspace"],
    defaultChannel: "workspace",
    defaultCadence: "immediate",
    defaultEnabled: true,
    recipientReason: "你是当前流程处理人",
    resourceKey: (payload) => payload.resourceKey,
    scopeId: (payload) => payload.scopeId ?? null,
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
    label: "流程被驳回",
    description: "通用审批单被驳回后提醒发起人",
    groupKey: "workflow",
    groupLabel: "流程待办",
    triggerDescription: "你发起或参与的流程被驳回时。",
    recipientDescription: "按流程发起人和相关参与人职责接收。",
    audienceMode: "assigned",
    subscriptionMode: "required",
    ownerResourceKey: null,
    supportedChannels: ["workspace"],
    defaultChannel: "workspace",
    defaultCadence: "immediate",
    defaultEnabled: true,
    recipientReason: "你是该流程的发起人或相关参与人",
    resourceKey: (payload) => payload.resourceKey,
    scopeId: (payload) => payload.scopeId ?? null,
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
    label: "流程已通过",
    description: "通用审批单通过后提醒发起人",
    groupKey: "workflow",
    groupLabel: "流程待办",
    triggerDescription: "你发起或参与的流程通过时。",
    recipientDescription: "按流程发起人和相关参与人职责接收。",
    audienceMode: "assigned",
    subscriptionMode: "required",
    ownerResourceKey: null,
    supportedChannels: ["workspace"],
    defaultChannel: "workspace",
    defaultCadence: "immediate",
    defaultEnabled: true,
    recipientReason: "你是该流程的发起人或相关参与人",
    resourceKey: (payload) => payload.resourceKey,
    scopeId: (payload) => payload.scopeId ?? null,
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
    label: "流程新评论",
    description: "通用审批单新增评论后提醒相关人",
    groupKey: "workflow",
    groupLabel: "流程待办",
    triggerDescription: "你参与的流程出现新评论时。",
    recipientDescription: "按流程相关参与人职责接收。",
    audienceMode: "assigned",
    subscriptionMode: "required",
    ownerResourceKey: null,
    supportedChannels: ["workspace"],
    defaultChannel: "workspace",
    defaultCadence: "immediate",
    defaultEnabled: true,
    recipientReason: "你是该流程的相关参与人",
    resourceKey: (payload) => payload.resourceKey,
    scopeId: (payload) => payload.scopeId ?? null,
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
    label: definition.label,
    description: definition.description,
    groupKey: definition.groupKey,
    groupLabel: definition.groupLabel,
    triggerDescription: definition.triggerDescription,
    recipientDescription: definition.recipientDescription,
    audienceMode: definition.audienceMode,
    subscriptionMode: definition.subscriptionMode,
    ownerResourceKey: definition.ownerResourceKey,
    supportedChannels: [...definition.supportedChannels],
    defaultChannel: definition.defaultChannel,
    defaultCadence: definition.defaultCadence,
    defaultEnabled: definition.defaultEnabled,
    details: [...(definition.details ?? [])],
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
  const recipientReason = input.deliveryContext?.recipientReason
    ?? resolveNotificationMetadata(definition.recipientReason, input.payload);
  const resourceKey = input.deliveryContext?.resourceKey
    ?? resolveNotificationMetadata(definition.resourceKey, input.payload);
  const scopeId = input.deliveryContext?.scopeId
    ?? resolveNotificationMetadata(definition.scopeId, input.payload);
  return createNotification({
    recipientUserId: input.recipientUserId,
    actorUserId: input.actorUserId,
    type: input.type,
    title: rendered.title,
    body: rendered.body,
    href: rendered.href,
    payload: rendered.payload ?? input.payload,
    recipientReason,
    resourceKey,
    scopeId,
    subscriptionId: input.deliveryContext?.subscriptionId ?? null,
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
      recipientReason: input.recipientReason ?? null,
      resourceKey: input.resourceKey ?? null,
      scopeId: input.scopeId ?? null,
      subscriptionId: input.subscriptionId ?? null,
      isImportant: input.isImportant ?? false,
      isStrongReminder: input.isStrongReminder ?? false,
      requiresAcknowledgement: input.requiresAcknowledgement ?? input.isImportant ?? false,
    },
  });
}

function resolveNotificationMetadata<TPayload>(
  value: string | ((payload: TPayload) => string | null) | undefined,
  payload: TPayload,
) {
  return typeof value === "function" ? value(payload) : value ?? null;
}
