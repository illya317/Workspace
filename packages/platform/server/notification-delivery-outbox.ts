import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { failCommand, okCommand, type DomainValidationResult } from "./domain-validation";
import {
  recordNotificationEndpointDeliveryHealth,
  recordNotificationEndpointHeartbeatHealth,
} from "./notification-channel-health";
import { prisma, Prisma } from "./prisma";
import { WECOM_NOTIFICATION_ENDPOINT_KEY } from "./wecom-notification-worker-auth";
export type NotificationDeliveryChannel = "workspace" | "wecom";
export type NotificationDeliveryStatus =
  | "pending"
  | "leased"
  | "delivered"
  | "retrying"
  | "failed";
export type WecomDeliveryResultOutcome =
  | "delivered"
  | "retryable_failure"
  | "permanent_failure";

export const WECOM_NOTIFICATION_ENDPOINT_LABEL = "企业微信智能机器人";
export const WECOM_NOTIFICATION_RUNTIME_BINDING_KEY = "assistant.wecom.primary";
export const WECOM_DELIVERY_MAX_ATTEMPTS = 6;
export const WECOM_DELIVERY_LEASE_MS = 2 * 60 * 1_000;
export const WECOM_DELIVERY_CLAIM_MAX = 50;
export const WECOM_NOTIFICATION_CAPABILITY_HEARTBEAT_MAX_AGE_MS = 5 * 60 * 1_000;
type DatabaseClient = Prisma.TransactionClient | typeof prisma;
export type ClaimedWecomNotificationDelivery = {
  id: number;
  publicationId: string;
  attemptNo: number;
  leaseToken: string;
  leaseExpiresAt: string;
  destination: string;
  title: string;
  body: string;
  href: string | null;
};
export type WecomNotificationDeliveryResultInput = {
  leaseToken: string;
  attemptNo: number;
  outcome: WecomDeliveryResultOutcome;
  providerMessageId?: string | null;
  errorCode?: string | null;
  errorSummary?: string | null;
};
export class NotificationDeliveryOutboxError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function ensureWecomNotificationEndpoint(client: DatabaseClient) {
  const existing = await client.notificationChannelEndpoint.findUnique({
    where: { key: WECOM_NOTIFICATION_ENDPOINT_KEY },
  });
  if (existing) return existing;

  return client.notificationChannelEndpoint.upsert({
    where: { key: WECOM_NOTIFICATION_ENDPOINT_KEY },
    create: {
      key: WECOM_NOTIFICATION_ENDPOINT_KEY,
      channel: "wecom",
      label: WECOM_NOTIFICATION_ENDPOINT_LABEL,
      runtimeBindingKey: WECOM_NOTIFICATION_RUNTIME_BINDING_KEY,
      status: "active",
      healthStatus: "unknown",
    },
    update: {
      channel: "wecom",
      label: WECOM_NOTIFICATION_ENDPOINT_LABEL,
      runtimeBindingKey: WECOM_NOTIFICATION_RUNTIME_BINDING_KEY,
    },
  });
}

export async function validateNotificationDeliveryChannelsForActivation(
  channels: readonly NotificationDeliveryChannel[],
  now = new Date(),
): Promise<DomainValidationResult<true>> {
  if (!channels.includes("wecom")) return okCommand(true);
  const secret = process.env.WECOM_WORKER_BRIDGE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    return failCommand("企业微信通知 Worker bridge 尚未配置", 409, "channelPolicy");
  }
  const endpoint = await prisma.notificationChannelEndpoint.findUnique({
    where: { key: WECOM_NOTIFICATION_ENDPOINT_KEY },
    select: {
      runtimeBindingKey: true,
      status: true,
      healthStatus: true,
      lastHeartbeatAt: true,
    },
  });
  const heartbeatCutoff = new Date(now.getTime() - WECOM_NOTIFICATION_CAPABILITY_HEARTBEAT_MAX_AGE_MS);
  if (
    !endpoint
    || endpoint.runtimeBindingKey !== WECOM_NOTIFICATION_RUNTIME_BINDING_KEY
    || endpoint.status !== "active"
    || endpoint.healthStatus !== "healthy"
    || !endpoint.lastHeartbeatAt
    || endpoint.lastHeartbeatAt < heartbeatCutoff
  ) {
    return failCommand("企业微信通知渠道未就绪，请确认 Bot Worker 已连接", 409, "channelPolicy");
  }
  return okCommand(true);
}

export function notificationDeliveryRetryDelayMs(attemptNo: number) {
  const delays = [30_000, 120_000, 600_000, 1_800_000, 7_200_000] as const;
  const index = Math.max(0, Math.min(delays.length - 1, attemptNo - 1));
  return delays[index]!;
}

export function deriveNotificationPublicationStatus(input: {
  channels: readonly NotificationDeliveryChannel[];
  pending: number;
  delivered: number;
  failed: number;
}) {
  if (!input.channels.includes("wecom")) return "committed" as const;
  if (input.pending > 0) return "processing" as const;
  if (input.failed > 0 && input.delivered > 0) return "partial" as const;
  if (input.failed > 0) return "failed" as const;
  return "delivered" as const;
}

export async function recalculateNotificationPublicationState(
  client: Prisma.TransactionClient,
  publicationId: string,
) {
  await client.$queryRaw(Prisma.sql`
    SELECT publication."id"
    FROM "NotificationPublication" AS publication
    WHERE publication."id" = ${publicationId}
    FOR UPDATE OF publication
  `);
  const groups = await client.notificationDelivery.groupBy({
    by: ["channel", "status"],
    where: { publicationId },
    _count: { _all: true },
  });
  let pending = 0;
  let delivered = 0;
  let failed = 0;
  const channels = new Set<NotificationDeliveryChannel>();
  for (const group of groups) {
    if (group.channel === "workspace" || group.channel === "wecom") channels.add(group.channel);
    if (group.status === "delivered") delivered += group._count._all;
    else if (group.status === "failed") failed += group._count._all;
    else pending += group._count._all;
  }
  const deliveryCount = pending + delivered + failed;
  const status = deriveNotificationPublicationStatus({
    channels: [...channels],
    pending,
    delivered,
    failed,
  });
  await client.notificationPublication.update({
    where: { id: publicationId },
    data: {
      status,
      deliveryCount,
      pendingDeliveryCount: pending,
      deliveredDeliveryCount: delivered,
      failedDeliveryCount: failed,
    },
  });
  return { status, deliveryCount, pending, delivered, failed };
}

export async function claimWecomNotificationDeliveries(
  client: Prisma.TransactionClient,
  input: {
    limit: number;
    now?: Date;
    leaseDurationMs?: number;
  },
) {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(WECOM_DELIVERY_CLAIM_MAX, Math.trunc(input.limit)));
  const leaseDurationMs = Math.max(30_000, Math.min(10 * 60 * 1_000, input.leaseDurationMs ?? WECOM_DELIVERY_LEASE_MS));
  const endpoint = await ensureWecomNotificationEndpoint(client);
  await releaseExpiredWecomLeases(client, endpoint.id, now);
  if (endpoint.status !== "active") {
    await recordNotificationEndpointHeartbeatHealth(client, {
      endpointId: endpoint.id,
      connected: true,
      observedAt: now,
    });
    return [] as ClaimedWecomNotificationDelivery[];
  }

  const candidates = await client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT delivery."id"
    FROM "NotificationDelivery" AS delivery
    WHERE delivery."channel" = 'wecom'
      AND delivery."endpointId" = ${endpoint.id}
      AND delivery."status" IN ('pending', 'retrying')
      AND (delivery."nextAttemptAt" IS NULL OR delivery."nextAttemptAt" <= ${now})
    ORDER BY delivery."nextAttemptAt" ASC NULLS FIRST, delivery."createdAt" ASC, delivery."id" ASC
    FOR UPDATE OF delivery SKIP LOCKED
    LIMIT ${limit}
  `);

  const claims: ClaimedWecomNotificationDelivery[] = [];
  const failedPublicationIds = new Set<string>();
  for (const candidate of candidates) {
    const delivery = await client.notificationDelivery.findUnique({ where: { id: candidate.id } });
    if (!delivery || (delivery.status !== "pending" && delivery.status !== "retrying")) continue;
    if (!delivery.destination || !delivery.title || !delivery.body) {
      await client.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "failed",
          failedAt: now,
          nextAttemptAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: "WECOM_DELIVERY_INVALID",
          lastErrorSummary: "企业微信投递缺少目标或消息快照",
        },
      });
      failedPublicationIds.add(delivery.publicationId);
      continue;
    }
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
    const attemptNo = delivery.attemptCount + 1;
    await client.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "leased",
        attemptCount: attemptNo,
        leaseToken,
        leaseExpiresAt,
        nextAttemptAt: null,
      },
    });
    claims.push({
      id: delivery.id,
      publicationId: delivery.publicationId,
      attemptNo,
      leaseToken,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
      destination: delivery.destination,
      title: delivery.title,
      body: delivery.body,
      href: delivery.href,
    });
  }
  for (const publicationId of failedPublicationIds) {
    await recalculateNotificationPublicationState(client, publicationId);
  }
  await recordNotificationEndpointHeartbeatHealth(client, {
    endpointId: endpoint.id,
    connected: true,
    observedAt: now,
  });
  return claims;
}

export async function recordWecomNotificationDeliveryResult(
  client: Prisma.TransactionClient,
  deliveryId: number,
  input: WecomNotificationDeliveryResultInput,
  now = new Date(),
) {
  const [lockedDelivery] = await client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT delivery."id"
    FROM "NotificationDelivery" AS delivery
    WHERE delivery."id" = ${deliveryId}
      AND delivery."channel" = 'wecom'
    FOR UPDATE OF delivery
  `);
  if (!lockedDelivery) {
    throw new NotificationDeliveryOutboxError(404, "DELIVERY_NOT_FOUND", "企业微信投递不存在");
  }
  const delivery = await client.notificationDelivery.findUnique({
    where: { id: deliveryId },
    include: { attempts: { where: { attemptNo: input.attemptNo }, take: 1 } },
  });
  if (!delivery || delivery.channel !== "wecom") {
    throw new NotificationDeliveryOutboxError(404, "DELIVERY_NOT_FOUND", "企业微信投递不存在");
  }

  const resultFingerprint = fingerprintDeliveryResult(input);
  const existingAttempt = delivery.attempts[0];
  if (existingAttempt) {
    if (existingAttempt.resultFingerprint !== resultFingerprint) {
      throw new NotificationDeliveryOutboxError(409, "DELIVERY_RESULT_CONFLICT", "该投递尝试已有不同结果");
    }
    return deliveryResultDto(delivery, true);
  }
  if (
    delivery.status !== "leased"
    || delivery.leaseToken !== input.leaseToken
    || delivery.attemptCount !== input.attemptNo
  ) {
    throw new NotificationDeliveryOutboxError(409, "DELIVERY_LEASE_STALE", "企业微信投递租约已失效");
  }
  if (!delivery.leaseExpiresAt || delivery.leaseExpiresAt <= now) {
    throw new NotificationDeliveryOutboxError(409, "DELIVERY_LEASE_EXPIRED", "企业微信投递租约已过期");
  }

  const errorCode = normalizeWorkerField(input.errorCode, 120);
  const errorSummary = sanitizeWorkerErrorSummary(input.errorSummary);
  const providerMessageId = normalizeWorkerField(input.providerMessageId, 256);
  const retrying = input.outcome === "retryable_failure"
    && input.attemptNo < WECOM_DELIVERY_MAX_ATTEMPTS;
  const nextAttemptAt = retrying
    ? new Date(now.getTime() + notificationDeliveryRetryDelayMs(input.attemptNo))
    : null;
  const status: NotificationDeliveryStatus = input.outcome === "delivered"
    ? "delivered"
    : retrying ? "retrying" : "failed";

  await client.notificationDeliveryAttempt.create({
    data: {
      deliveryId: delivery.id,
      attemptNo: input.attemptNo,
      outcome: status,
      resultFingerprint,
      providerMessageId,
      errorCode,
      errorSummary,
      nextAttemptAt,
    },
  });
  const updated = await client.notificationDelivery.update({
    where: { id: delivery.id },
    data: {
      status,
      nextAttemptAt,
      leaseToken: null,
      leaseExpiresAt: null,
      deliveredAt: status === "delivered" ? now : null,
      failedAt: status === "failed" ? now : null,
      lastErrorCode: status === "delivered" ? null : errorCode ?? "WECOM_DELIVERY_FAILED",
      lastErrorSummary: status === "delivered" ? null : errorSummary ?? "企业微信投递失败",
      providerMessageId: status === "delivered" ? providerMessageId : null,
    },
  });
  await recalculateNotificationPublicationState(client, delivery.publicationId);
  if (delivery.endpointId) {
    await recordNotificationEndpointDeliveryHealth(client, {
      endpointId: delivery.endpointId,
      delivered: status === "delivered",
      retrying,
      errorCode,
      errorSummary,
      observedAt: now,
    });
  }
  return deliveryResultDto(updated, false);
}

export async function recordWecomNotificationWorkerHeartbeat(
  client: Prisma.TransactionClient,
  input: {
    workerId: string;
    connected: boolean;
    workerVersion?: string | null;
  },
  now = new Date(),
) {
  const endpoint = await ensureWecomNotificationEndpoint(client);
  await recordNotificationEndpointHeartbeatHealth(client, {
    endpointId: endpoint.id,
    connected: input.connected,
    observedAt: now,
  });
  const refreshedEndpoint = await client.notificationChannelEndpoint.findUnique({
    where: { id: endpoint.id },
    select: { healthStatus: true },
  });
  await client.notificationDeliveryWorkerRequest.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return {
    endpointKey: endpoint.key,
    workerId: input.workerId,
    enabled: endpoint.status === "active",
    connected: input.connected,
    healthStatus: refreshedEndpoint?.healthStatus ?? (input.connected ? "unknown" : "disconnected"),
    workerVersion: normalizeWorkerField(input.workerVersion, 120),
    heartbeatAt: now.toISOString(),
  };
}

export function sanitizeWorkerErrorSummary(value: string | null | undefined) {
  const normalized = normalizeWorkerField(value, 500);
  if (!normalized) return null;
  return normalized
    .replace(/\b(authorization|token|secret|key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url-redacted]");
}

async function releaseExpiredWecomLeases(
  client: Prisma.TransactionClient,
  endpointId: number,
  now: Date,
) {
  const expired = await client.$queryRaw<Array<{
    id: number;
    publicationId: string;
    attemptCount: number;
  }>>(Prisma.sql`
    SELECT delivery."id", delivery."publicationId", delivery."attemptCount"
    FROM "NotificationDelivery" AS delivery
    WHERE delivery."channel" = 'wecom'
      AND delivery."endpointId" = ${endpointId}
      AND delivery."status" = 'leased'
      AND delivery."leaseExpiresAt" <= ${now}
    ORDER BY delivery."leaseExpiresAt" ASC, delivery."id" ASC
    FOR UPDATE OF delivery SKIP LOCKED
    LIMIT 100
  `);
  for (const delivery of expired) {
    const nextAttemptAt = delivery.attemptCount >= WECOM_DELIVERY_MAX_ATTEMPTS
      ? null
      : now;
    const status: NotificationDeliveryStatus = nextAttemptAt ? "retrying" : "failed";
    const result = {
      leaseToken: "expired",
      attemptNo: delivery.attemptCount,
      outcome: status === "retrying" ? "retryable_failure" : "permanent_failure",
      errorCode: "WECOM_LEASE_EXPIRED",
      errorSummary: "企业微信 Worker 未在租约内提交结果",
    } satisfies WecomNotificationDeliveryResultInput;
    await client.notificationDeliveryAttempt.create({
      data: {
        deliveryId: delivery.id,
        attemptNo: delivery.attemptCount,
        outcome: status,
        resultFingerprint: fingerprintDeliveryResult(result),
        errorCode: result.errorCode,
        errorSummary: result.errorSummary,
        nextAttemptAt,
      },
    });
    await client.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        nextAttemptAt,
        leaseToken: null,
        leaseExpiresAt: null,
        failedAt: status === "failed" ? now : null,
        lastErrorCode: result.errorCode,
        lastErrorSummary: result.errorSummary,
      },
    });
    if (status === "failed") {
      await recalculateNotificationPublicationState(client, delivery.publicationId);
    }
  }
}

function deliveryResultDto(delivery: {
  id: number;
  publicationId: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
}, replayed: boolean) {
  return {
    deliveryId: delivery.id,
    publicationId: delivery.publicationId,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    failedAt: delivery.failedAt?.toISOString() ?? null,
    replayed,
  };
}

function fingerprintDeliveryResult(input: WecomNotificationDeliveryResultInput) {
  return createHash("sha256").update(JSON.stringify({
    attemptNo: input.attemptNo,
    outcome: input.outcome,
    providerMessageId: normalizeWorkerField(input.providerMessageId, 256),
    errorCode: normalizeWorkerField(input.errorCode, 120),
    errorSummary: sanitizeWorkerErrorSummary(input.errorSummary),
  })).digest("hex");
}

function normalizeWorkerField(value: string | null | undefined, maxLength: number) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}
