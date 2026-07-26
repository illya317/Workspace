import { sendNotification, type ApprovalNotificationPayload } from "../notifications";
import type { ApprovalAdapter, ApprovalEventType, ApprovalRequestRecord } from "./types";

export async function notifyApproval<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  eventType: ApprovalEventType,
  request: ApprovalRequestRecord<TPayload>,
  actorUserId: number,
) {
  const notificationType = notificationTypeForEvent(eventType);
  if (!notificationType) return;
  const recipients = dedupeNumbers(await resolveNotificationRecipients(adapter, eventType, request, actorUserId))
    .filter((recipientUserId) => recipientUserId !== actorUserId);
  if (recipients.length === 0) return;
  const description = await adapter.describeRequest({ request });
  const basePayload = {
    requestId: request.id,
    businessActionKey: request.businessActionKey,
    title: description.title,
    summary: description.summary,
    href: description.href,
    eventType,
    status: notificationStatusForEvent(eventType, request.status),
    resourceKey: request.resourceKey,
    scopeId: request.scopeId,
    flowType: request.flowType,
    submitterUserId: request.submitterUserId,
  } satisfies Omit<ApprovalNotificationPayload, "workflowRole">;
  await Promise.all(recipients.map((recipientUserId) => sendNotification({
    recipientUserId,
    actorUserId,
    type: notificationType,
    payload: {
      ...basePayload,
      workflowRole: workflowRoleForRecipient(eventType, request, recipientUserId),
    },
    requiresAcknowledgement: false,
  }).catch((error) => {
    console.error("Failed to send approval notification", error);
    return null;
  })));
}

async function resolveNotificationRecipients<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  eventType: ApprovalEventType,
  request: ApprovalRequestRecord<TPayload>,
  actorUserId: number,
) {
  if (eventType === "submit" && adapter.resolveHandlers) {
    return adapter.resolveHandlers({ handlerSource: request.handlerSource, request, actorUserId });
  }
  return adapter.resolveRecipients({ eventType, request, actorUserId });
}

function notificationTypeForEvent(eventType: ApprovalEventType) {
  if (eventType === "submit") return "approval.request.submitted" as const;
  if (eventType === "reject") return "approval.request.rejected" as const;
  if (eventType === "approve" || eventType === "review" || eventType === "publish") return "approval.request.approved" as const;
  if (eventType === "comment") return "approval.request.commented" as const;
  return null;
}

function workflowRoleForRecipient<TPayload>(
  eventType: ApprovalEventType,
  request: ApprovalRequestRecord<TPayload>,
  recipientUserId: number,
) {
  if (eventType === "submit") return "todo" as const;
  if (eventType === "approve" || eventType === "review" || eventType === "publish" || eventType === "reject") {
    return "originated" as const;
  }
  if (eventType === "comment") return recipientUserId === request.submitterUserId ? "originated" as const : "todo" as const;
  return "watching" as const;
}

function notificationStatusForEvent(eventType: ApprovalEventType, fallbackStatus: string) {
  if (eventType === "publish") return "published";
  if (eventType === "review" || eventType === "approve") return "approved";
  if (eventType === "reject") return "rejected";
  if (eventType === "submit") return "submitted";
  return fallbackStatus;
}

function dedupeNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}
