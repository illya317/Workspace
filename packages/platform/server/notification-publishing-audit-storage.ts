import "server-only";

import { Prisma, prisma } from "./prisma";
import {
  toPublicationSummaryDto,
  type NotificationChannelEndpointSummaryDto,
  type NotificationDefinitionLifecycleAction,
  type NotificationDefinitionLifecycleEventDto,
  type NotificationPublicationSummaryDto,
  type NotificationPublishingClientDto,
} from "./notification-publishing-storage-contract";

export async function listNotificationPublishingClients(): Promise<NotificationPublishingClientDto[]> {
  return prisma.openApiClient.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, status: true },
  });
}

export async function listNotificationPublicationSummaries(): Promise<NotificationPublicationSummaryDto[]> {
  const rows = await prisma.notificationPublication.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map(toPublicationSummaryDto);
}

export async function listNotificationDefinitionLifecycleEvents(): Promise<NotificationDefinitionLifecycleEventDto[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    definitionId: number;
    definitionKey: string;
    definitionLabel: string;
    revision: number;
    action: string;
    actorUserId: number;
    actorUsername: string;
    occurredAt: Date;
    priorVersion: number;
    newVersion: number;
  }>>(Prisma.sql`
    SELECT
      event."id",
      event."definitionId",
      definition."key" AS "definitionKey",
      definition."label" AS "definitionLabel",
      event."revision",
      event."action",
      event."actorUserId",
      actor."username" AS "actorUsername",
      event."occurredAt",
      event."priorVersion",
      event."newVersion"
    FROM "NotificationDefinitionLifecycleEvent" AS event
    INNER JOIN "NotificationDefinition" AS definition
      ON definition."id" = event."definitionId"
    INNER JOIN "User" AS actor
      ON actor."id" = event."actorUserId"
    ORDER BY event."occurredAt" DESC, event."id" DESC
    LIMIT 50
  `);
  return rows.flatMap((row) => {
    const action = lifecycleAction(row.action);
    return action ? [{
      id: row.id,
      definitionId: row.definitionId,
      definitionKey: row.definitionKey,
      definitionLabel: row.definitionLabel,
      revision: row.revision,
      action,
      actorUserId: row.actorUserId,
      actorUsername: row.actorUsername,
      occurredAt: row.occurredAt.toISOString(),
      priorVersion: row.priorVersion,
      newVersion: row.newVersion,
    }] : [];
  });
}

export async function listNotificationChannelEndpointSummaries(): Promise<NotificationChannelEndpointSummaryDto[]> {
  const [endpoints, deliveryGroups] = await Promise.all([
    prisma.notificationChannelEndpoint.findMany({
      orderBy: [{ channel: "asc" }, { key: "asc" }],
      select: {
        id: true,
        key: true,
        channel: true,
        label: true,
        status: true,
        healthStatus: true,
        lastHeartbeatAt: true,
        lastSuccessAt: true,
        lastFailureAt: true,
        lastErrorCode: true,
        lastErrorSummary: true,
      },
    }),
    prisma.notificationDelivery.groupBy({
      by: ["endpointId", "status"],
      where: { endpointId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const countsByEndpoint = new Map<number, {
    pending: number;
    delivered: number;
    failed: number;
  }>();
  for (const group of deliveryGroups) {
    if (group.endpointId === null) continue;
    const counts = countsByEndpoint.get(group.endpointId) ?? { pending: 0, delivered: 0, failed: 0 };
    if (group.status === "delivered") counts.delivered += group._count._all;
    else if (group.status === "failed") counts.failed += group._count._all;
    else counts.pending += group._count._all;
    countsByEndpoint.set(group.endpointId, counts);
  }
  return endpoints.map((endpoint) => {
    const counts = countsByEndpoint.get(endpoint.id) ?? { pending: 0, delivered: 0, failed: 0 };
    return {
      key: endpoint.key,
      channel: endpoint.channel,
      label: endpoint.label,
      status: endpoint.status,
      healthStatus: endpoint.healthStatus,
      lastHeartbeatAt: endpoint.lastHeartbeatAt?.toISOString() ?? null,
      lastSuccessAt: endpoint.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: endpoint.lastFailureAt?.toISOString() ?? null,
      lastErrorCode: endpoint.lastErrorCode,
      lastErrorSummary: sanitizeEndpointErrorSummary(endpoint.lastErrorSummary),
      deliveryCount: counts.pending + counts.delivered + counts.failed,
      pendingDeliveryCount: counts.pending,
      deliveredDeliveryCount: counts.delivered,
      failedDeliveryCount: counts.failed,
    };
  });
}

function lifecycleAction(value: string): NotificationDefinitionLifecycleAction | null {
  return value === "created" || value === "saved" || value === "published" || value === "archived"
    ? value
    : null;
}

function sanitizeEndpointErrorSummary(value: string | null) {
  if (!value) return null;
  return value
    .replace(/\b(authorization|token|secret|key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url-redacted]")
    .slice(0, 500);
}
