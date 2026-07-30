import { prisma } from "./prisma";
import {
  parsePayloadRecord,
  type NotificationCategory,
} from "./notification-workflow";
import { toOriginatedWorkflowDto } from "./workflow-inbox-projection";

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

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
