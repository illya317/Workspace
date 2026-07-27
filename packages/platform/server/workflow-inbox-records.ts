import { prisma } from "./prisma";
import {
  deriveWorkflowNotification,
  parsePayloadRecord,
  workflowClassification,
  type NotificationCategory,
  type WorkflowFlowType,
  type WorkflowStatus,
} from "./notification-workflow";
import type { WorkflowTodoProviderItem } from "./workflow-todo-providers";

export async function listOriginatedWorkflowRequestItems(
  userId: number,
  take: number,
  skip: number,
  category: NotificationCategory,
) {
  const flowType = category === "approval" || category === "review" || category === "publish" ? category : null;
  const where = {
    submitterUserId: userId,
    ...(flowType ? { flowType } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.approvalRequest.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.approvalRequest.count({ where }),
  ]);
  return { items: rows.map(toOriginatedWorkflowDto), total };
}

export function toProviderWorkflowTodoDto(item: WorkflowTodoProviderItem) {
  const createdAt = item.createdAt.toISOString();
  const classification = workflowClassification(item.businessActionKey);
  return {
    id: -Math.abs(item.requestId),
    type: "approval.request.submitted",
    category: "workflow" as const,
    workflow: {
      requestId: item.requestId,
      flowType: item.flowType,
      status: item.status ?? "submitted",
      role: "todo" as const,
      title: item.title,
      summary: item.summary,
      href: item.href,
      eventType: item.eventType ?? "submit",
      businessActionKey: item.businessActionKey,
      categoryKey: classification.categoryKey,
      categoryLabel: classification.categoryLabel,
      resourceKey: item.resourceKey,
      scopeId: item.scopeId,
    },
    title: item.title,
    body: item.summary,
    href: item.href,
    recipientReason: "你是当前流程处理人",
    resourceKey: item.resourceKey,
    scopeId: item.scopeId,
    isImportant: true,
    isStrongReminder: false,
    requiresAcknowledgement: false,
    readAt: createdAt,
    acknowledgedAt: null,
    rejectedAt: null,
    createdAt,
    actor: item.actor ? { id: item.actor.id, name: item.actor.name, avatar: item.actor.avatar ?? null } : null,
  };
}

export function toNotificationDto(
  item: NotificationModelRow,
  userId: number,
  actionKeysByRequestId: ReadonlyMap<number, string> = new Map(),
) {
  const payload = parsePayloadRecord(item.payloadJson);
  const requestId = numberFromUnknown(payload.requestId);
  const workflow = deriveWorkflowNotification(item, payload, userId, requestId ? actionKeysByRequestId.get(requestId) : null);
  return {
    id: item.id,
    type: item.type,
    category: workflow ? "workflow" as const : "ordinary" as const,
    workflow,
    title: item.title,
    body: item.body,
    href: item.href,
    recipientReason: item.recipientReason,
    resourceKey: item.resourceKey,
    scopeId: item.scopeId,
    isImportant: item.isImportant,
    isStrongReminder: item.isStrongReminder,
    requiresAcknowledgement: item.requiresAcknowledgement,
    readAt: item.readAt?.toISOString() ?? null,
    acknowledgedAt: item.acknowledgedAt?.toISOString() ?? null,
    rejectedAt: item.rejectedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    actor: item.actor
      ? { id: item.actor.id, name: item.actor.employees[0]?.name ?? "", avatar: item.actor.avatar }
      : null,
  };
}

export async function approvalActionKeysForNotifications(items: readonly { payloadJson: string | null }[]) {
  const requestIds = Array.from(new Set(items
    .map((item) => numberFromUnknown(parsePayloadRecord(item.payloadJson).requestId))
    .filter((requestId): requestId is number => Boolean(requestId))));
  if (requestIds.length === 0) return new Map<number, string>();
  const requests = await prisma.approvalRequest.findMany({
    where: { id: { in: requestIds } },
    select: { id: true, businessActionKey: true },
  });
  return new Map(requests.map((request) => [request.id, request.businessActionKey]));
}

type NotificationModelRow = {
  id: number;
  type: string;
  title: string;
  body: string;
  href: string | null;
  payloadJson: string | null;
  recipientReason: string | null;
  resourceKey: string | null;
  scopeId: string | null;
  isImportant: boolean;
  isStrongReminder: boolean;
  requiresAcknowledgement: boolean;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  actor: { id: number; avatar: string | null; employees: Array<{ name: string }> } | null;
};

function toOriginatedWorkflowDto(row: {
  id: number; businessActionKey: string; flowType: string; status: string; subjectType: string; subjectId: string | null;
  resourceKey: string; scopeId: string | null; updatedAt: Date;
}) {
  const classification = workflowClassification(row.businessActionKey);
  const title = classification.action?.label ?? row.businessActionKey;
  const summary = row.subjectId ? `${row.subjectType} · ${row.subjectId}` : `${row.subjectType} · 新建请求`;
  const href = workflowOriginHref(classification.action?.originHrefPattern, row.id);
  const createdAt = row.updatedAt.toISOString();
  return {
    id: -Math.abs(row.id), type: "workflow.request.originated", category: "workflow" as const,
    workflow: {
      requestId: row.id, flowType: normalizeWorkflowFlowType(row.flowType), status: normalizeWorkflowRequestStatus(row.status),
      role: "originated" as const, title, summary, href, eventType: workflowEventTypeForStatus(row.status),
      businessActionKey: row.businessActionKey, categoryKey: classification.categoryKey, categoryLabel: classification.categoryLabel,
      resourceKey: row.resourceKey, scopeId: row.scopeId,
    },
    title,
    body: summary,
    href,
    recipientReason: "你是该流程的发起人",
    resourceKey: row.resourceKey,
    scopeId: row.scopeId,
    isImportant: false,
    isStrongReminder: false,
    requiresAcknowledgement: false,
    readAt: createdAt,
    acknowledgedAt: null,
    rejectedAt: null,
    createdAt,
    actor: null,
  };
}

function workflowOriginHref(pattern: string | null | undefined, requestId: number) {
  return pattern ? `${pattern}${pattern.includes("?") ? "&" : "?"}approvalId=${requestId}` : null;
}

function normalizeWorkflowFlowType(value: string): WorkflowFlowType {
  return value === "review" || value === "publish" ? value : "approval";
}

function normalizeWorkflowRequestStatus(value: string): WorkflowStatus {
  if (value === "committing") return "in_review";
  if (value === "draft" || value === "submitted" || value === "rejected" || value === "withdrawn" || value === "approved" || value === "cancelled") return value;
  return "failed";
}

function workflowEventTypeForStatus(status: string) {
  if (status === "submitted") return "submit";
  if (status === "approved") return "approve";
  if (status === "rejected") return "reject";
  if (status === "withdrawn") return "withdraw";
  if (status === "cancelled") return "cancel";
  return null;
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
