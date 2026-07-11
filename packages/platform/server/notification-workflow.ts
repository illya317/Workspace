import { Prisma } from "./prisma";
import { getBusinessActionRegistration } from "../business-action-registry";
import { getWorkflowCategoryRegistration } from "../workflow-category-registry";
import {
  parseWorkflowStatus,
  type WorkflowFlowType,
  type WorkflowStatus,
} from "../workflow-status";

export type NotificationCategory = "all" | "ordinary" | "workflow" | "approval" | "review" | "publish";
export type NotificationFilter = "all" | "todo" | "originated";
export type WorkflowNotificationRole = "todo" | "originated" | "watching";
export type { WorkflowFlowType, WorkflowStatus } from "../workflow-status";

export type ListUserNotificationsOptions = {
  limit?: number;
  offset?: number;
  category?: NotificationCategory;
  filter?: NotificationFilter;
};

export type NotificationWorkflowDto = {
  requestId: number | null;
  flowType: WorkflowFlowType;
  status: WorkflowStatus;
  role: WorkflowNotificationRole;
  title: string;
  summary: string;
  href: string | null;
  eventType: string | null;
  businessActionKey: string | null;
  categoryKey: string | null;
  categoryLabel: string | null;
  resourceKey: string | null;
  scopeId: string | null;
};

const WORKFLOW_NOTIFICATION_TYPES = [
  "approval.request.submitted",
  "approval.request.rejected",
  "approval.request.approved",
  "approval.request.commented",
] as const;
const WORKFLOW_TODO_NOTIFICATION_TYPES = ["approval.request.submitted"] as const;
const WORKFLOW_ORIGINATED_NOTIFICATION_TYPES = [
  "approval.request.rejected",
  "approval.request.approved",
] as const;
const WORKFLOW_FLOW_TYPES = ["approval", "review", "publish"] as const satisfies readonly WorkflowFlowType[];

export function normalizeNotificationQuery(
  options: Pick<ListUserNotificationsOptions, "category" | "filter">,
): Required<Pick<ListUserNotificationsOptions, "category" | "filter">> {
  return {
    category: options.category ?? "all",
    filter: options.filter ?? "all",
  };
}

export function baseNotificationWhere(userId: number): Prisma.NotificationWhereInput {
  return { recipientUserId: userId, clearedAt: null };
}

export function buildNotificationWhere(
  userId: number,
  query: Required<Pick<ListUserNotificationsOptions, "category" | "filter">>,
): Prisma.NotificationWhereInput {
  const and: Prisma.NotificationWhereInput[] = [baseNotificationWhere(userId)];
  const categoryWhere = notificationCategoryWhere(query.category);
  if (categoryWhere) and.push(categoryWhere);
  const filterWhere = notificationFilterWhere(userId, query.filter);
  if (filterWhere) and.push(filterWhere);
  return { AND: and };
}

export function buildNotificationSqlWhere(
  userId: number,
  query: Required<Pick<ListUserNotificationsOptions, "category" | "filter">>,
) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`recipientUserId = ${userId}`,
    Prisma.sql`clearedAt IS NULL`,
  ];
  const category = notificationCategorySql(query.category);
  if (category) conditions.push(category);
  const filter = notificationFilterSql(userId, query.filter);
  if (filter) conditions.push(filter);
  return Prisma.join(conditions, " AND ");
}

export function parsePayloadRecord(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function deriveWorkflowNotification(
  item: { type: string; title: string; body: string; href: string | null },
  payload: Record<string, unknown>,
  userId: number,
  fallbackBusinessActionKey?: string | null,
): NotificationWorkflowDto | null {
  if (!isWorkflowNotification(item.type, payload)) return null;
  const flowType = normalizeWorkflowFlowType(payload.flowType) ?? flowTypeFromType(item.type) ?? "approval";
  const eventType = stringValue(payload.eventType);
  const status = parseWorkflowStatus(payload.status) ?? statusFromEvent(eventType) ?? "submitted";
  const businessActionKey = stringValue(payload.businessActionKey) ?? fallbackBusinessActionKey ?? null;
  const classification = workflowClassification(businessActionKey);
  return {
    requestId: numberValue(payload.requestId),
    flowType,
    status,
    role: workflowRoleForNotification(item.type, payload, userId),
    title: stringValue(payload.title) ?? item.title,
    summary: stringValue(payload.summary) ?? item.body,
    href: stringValue(payload.href) ?? item.href,
    eventType,
    businessActionKey,
    categoryKey: classification.categoryKey,
    categoryLabel: classification.categoryLabel,
    resourceKey: stringValue(payload.resourceKey),
    scopeId: stringValue(payload.scopeId),
  };
}

export function workflowClassification(businessActionKey: string | null | undefined) {
  const action = businessActionKey ? getBusinessActionRegistration(businessActionKey) : null;
  const category = getWorkflowCategoryRegistration(action?.workflowCategoryKey);
  return {
    action,
    categoryKey: category?.key ?? null,
    categoryLabel: category?.label ?? null,
  };
}

function notificationCategoryWhere(category: NotificationCategory): Prisma.NotificationWhereInput | null {
  if (category === "all") return null;
  if (category === "ordinary") return { NOT: [workflowNotificationWhere()] };
  if (category === "workflow") return workflowNotificationWhere();
  return workflowFlowTypeWhere(category);
}

function workflowNotificationWhere(): Prisma.NotificationWhereInput {
  return {
    OR: [
      { type: { in: [...WORKFLOW_NOTIFICATION_TYPES] } },
      { type: { startsWith: "workflow." } },
      { type: { startsWith: "approval." } },
      { type: { startsWith: "review." } },
      { type: { startsWith: "publish." } },
      ...WORKFLOW_FLOW_TYPES.map((flowType) => ({ payloadJson: { contains: flowTypePayloadNeedle(flowType) } })),
    ],
  };
}

function workflowFlowTypeWhere(flowType: WorkflowFlowType): Prisma.NotificationWhereInput {
  const typePrefix = `${flowType}.`;
  if (flowType === "approval") {
    return {
      OR: [
        { payloadJson: { contains: flowTypePayloadNeedle("approval") } },
        {
          AND: [
            { type: { startsWith: typePrefix } },
            { NOT: [
              { payloadJson: { contains: flowTypePayloadNeedle("review") } },
              { payloadJson: { contains: flowTypePayloadNeedle("publish") } },
            ] },
          ],
        },
      ],
    };
  }
  return {
    OR: [
      { type: { startsWith: typePrefix } },
      { payloadJson: { contains: flowTypePayloadNeedle(flowType) } },
    ],
  };
}

function notificationFilterWhere(userId: number, filter: NotificationFilter): Prisma.NotificationWhereInput | null {
  if (filter === "all") return null;
  if (filter === "todo") {
    return {
      OR: [
        { type: { in: [...WORKFLOW_TODO_NOTIFICATION_TYPES] } },
        { payloadJson: { contains: `"workflowRole":"todo"` } },
      ],
    };
  }
  return {
    OR: [
      { type: { in: [...WORKFLOW_ORIGINATED_NOTIFICATION_TYPES] } },
      { payloadJson: { contains: `"workflowRole":"originated"` } },
      { payloadJson: { contains: `"submitterUserId":${userId}` } },
      { payloadJson: { contains: `"originatorUserId":${userId}` } },
    ],
  };
}

function notificationCategorySql(category: NotificationCategory): Prisma.Sql | null {
  if (category === "all") return null;
  if (category === "ordinary") return Prisma.sql`NOT (${workflowNotificationSql()})`;
  if (category === "workflow") return workflowNotificationSql();
  return workflowFlowTypeSql(category);
}

function workflowNotificationSql() {
  return Prisma.sql`(
    type IN (${Prisma.join([...WORKFLOW_NOTIFICATION_TYPES])})
    OR type LIKE ${"workflow.%"}
    OR type LIKE ${"approval.%"}
    OR type LIKE ${"review.%"}
    OR type LIKE ${"publish.%"}
    OR ${Prisma.join(WORKFLOW_FLOW_TYPES.map((flowType) => Prisma.sql`COALESCE(payloadJson, '') LIKE ${payloadFlowTypeLike(flowType)}`), " OR ")}
  )`;
}

function workflowFlowTypeSql(flowType: WorkflowFlowType) {
  const typePrefix = `${flowType}.%`;
  if (flowType === "approval") {
    return Prisma.sql`(
      COALESCE(payloadJson, '') LIKE ${payloadFlowTypeLike("approval")}
      OR (
        type LIKE ${typePrefix}
        AND COALESCE(payloadJson, '') NOT LIKE ${payloadFlowTypeLike("review")}
        AND COALESCE(payloadJson, '') NOT LIKE ${payloadFlowTypeLike("publish")}
      )
    )`;
  }
  const conditions: Prisma.Sql[] = [
    Prisma.sql`type LIKE ${typePrefix}`,
    Prisma.sql`COALESCE(payloadJson, '') LIKE ${payloadFlowTypeLike(flowType)}`,
  ];
  return Prisma.sql`(${Prisma.join(conditions, " OR ")})`;
}

function notificationFilterSql(userId: number, filter: NotificationFilter): Prisma.Sql | null {
  if (filter === "all") return null;
  if (filter === "todo") {
    return Prisma.sql`(
      type IN (${Prisma.join([...WORKFLOW_TODO_NOTIFICATION_TYPES])})
      OR COALESCE(payloadJson, '') LIKE ${`%"workflowRole":"todo"%`}
    )`;
  }
  return Prisma.sql`(
    type IN (${Prisma.join([...WORKFLOW_ORIGINATED_NOTIFICATION_TYPES])})
    OR COALESCE(payloadJson, '') LIKE ${`%"workflowRole":"originated"%`}
    OR COALESCE(payloadJson, '') LIKE ${`%"submitterUserId":${userId}%`}
    OR COALESCE(payloadJson, '') LIKE ${`%"originatorUserId":${userId}%`}
  )`;
}

function payloadFlowTypeLike(flowType: WorkflowFlowType) {
  return `%${flowTypePayloadNeedle(flowType)}%`;
}

function flowTypePayloadNeedle(flowType: WorkflowFlowType) {
  return `"flowType":"${flowType}"`;
}

function isWorkflowNotification(type: string, payload: Record<string, unknown>) {
  if (type.startsWith("workflow.") || type.startsWith("approval.") || type.startsWith("review.") || type.startsWith("publish.")) return true;
  return Boolean(normalizeWorkflowFlowType(payload.flowType) || stringValue(payload.workflowRole));
}

function workflowRoleForNotification(type: string, payload: Record<string, unknown>, userId: number): WorkflowNotificationRole {
  const role = normalizeWorkflowRole(payload.workflowRole);
  if (role) return role;
  const submitterUserId = numberValue(payload.submitterUserId) ?? numberValue(payload.originatorUserId);
  if (submitterUserId === userId) return "originated";
  if ((WORKFLOW_TODO_NOTIFICATION_TYPES as readonly string[]).includes(type)) return "todo";
  if ((WORKFLOW_ORIGINATED_NOTIFICATION_TYPES as readonly string[]).includes(type)) return "originated";
  return "watching";
}

function flowTypeFromType(type: string): WorkflowFlowType | null {
  if (type.startsWith("review.")) return "review";
  if (type.startsWith("publish.")) return "publish";
  if (type.startsWith("approval.")) return "approval";
  return null;
}

function normalizeWorkflowFlowType(value: unknown): WorkflowFlowType | null {
  return value === "approval" || value === "review" || value === "publish" ? value : null;
}

function normalizeWorkflowRole(value: unknown): WorkflowNotificationRole | null {
  return value === "todo" || value === "originated" || value === "watching" ? value : null;
}

function statusFromEvent(eventType: string | null): WorkflowStatus | null {
  if (eventType === "submit") return "submitted";
  if (eventType === "reject") return "rejected";
  if (eventType === "approve") return "approved";
  if (eventType === "review") return "approved";
  if (eventType === "publish") return "published";
  if (eventType === "withdraw") return "withdrawn";
  if (eventType === "cancel") return "cancelled";
  if (eventType === "commit_failed") return "failed";
  if (eventType === "comment" || eventType === "review_update" || eventType === "revise") return "in_review";
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
