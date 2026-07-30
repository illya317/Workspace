import "server-only";

import { serviceError, serviceOk, type ServiceResult } from "../service-result";
import {
  notificationPublicationRequestSchema,
  notificationPublicationSourceSchema,
  renderNotificationDefinition,
  type NotificationPublicationRequest,
  type NotificationPublicationSource,
  type NotificationResponseMode,
} from "./notification-definition-dsl";
import { failCommand, okCommand, type DomainValidationResult } from "./domain-validation";
import {
  canonicalNotificationPublicationFingerprint,
  legacyNotificationPublicationFingerprint,
} from "./notification-publishing-fingerprint";
import {
  deriveNotificationPublicationStatus,
  ensureWecomNotificationEndpoint,
  type NotificationDeliveryChannel,
} from "./notification-delivery-outbox";
import { prisma, Prisma } from "./prisma";
import {
  canSourceUseDefinition,
  RECIPIENTS_PER_SOURCE_PER_MINUTE,
  resolvePublishedDefinition,
  type PublishedDefinition,
} from "./notification-publishing-storage";
import {
  notificationPublicationRateLimit,
  type NotificationPublicationRateLimitDetails,
} from "./notification-publication-rate-limit";

export {
  commitNotificationDefinitionArchivedState,
  listPublishedNotificationDefinitionsForSource,
  publishNotificationDefinition,
  saveNotificationDefinition,
} from "./notification-publishing-storage";
export { notificationPublicationSourceSchema } from "./notification-definition-dsl";
export { canonicalNotificationPublicationFingerprint } from "./notification-publishing-fingerprint";
export { NOTIFICATION_PUBLICATION_RATE_LIMITED } from "./notification-publication-rate-limit";
export type { NotificationPublicationSource } from "./notification-definition-dsl";
export type { NotificationPublicationRateLimitDetails } from "./notification-publication-rate-limit";
export type {
  NotificationDefinitionDto,
  NotificationPublicationSummaryDto,
  NotificationPublishingClientDto,
  PublishedNotificationDefinitionDto,
} from "./notification-publishing-storage";

const CUSTOM_NOTIFICATION_TYPE = "custom.notification.published";

export const NOTIFICATION_PUBLICATION_COMMIT_GUARD_REJECTED =
  "notification_publication_commit_guard_rejected";

export type NotificationPublicationReceipt = {
  publicationId: string;
  definitionKey: string;
  revision: number;
  replayed: boolean;
  recipientCount: number;
  deliveryCount: number;
  status: string;
  pendingDeliveryCount: number;
  deliveredDeliveryCount: number;
  failedDeliveryCount: number;
  createdAt: string;
};

type ResolvedRecipient = { id: number; username: string; wxUserId: string | null };

export type NotificationProjectionInput = {
  recipientUserId: number;
  type: typeof CUSTOM_NOTIFICATION_TYPE;
  title: string;
  body: string;
  href: string | null;
  payload: {
    publicationId: string;
    definitionKey: string;
    revision: number;
  };
  recipientReason: string;
  dispatchId: string;
  isImportant: boolean;
  requiresAcknowledgement: boolean;
  responseMode: NotificationResponseMode;
};

export type NotificationProjectionWriter = (
  input: NotificationProjectionInput,
  client: Prisma.TransactionClient,
) => Promise<{ id: number }>;

export type NotificationPublicationCommitGuard = (
  client: Prisma.TransactionClient,
) => Promise<boolean>;

export type NotificationPublicationCommand =
  | {
      kind: "replay";
      source: NotificationPublicationSource;
      fingerprint: string;
      receipt: NotificationPublicationReceipt;
    }
  | {
      kind: "publish";
      source: NotificationPublicationSource;
      definition: PublishedDefinition;
      request: NotificationPublicationRequest;
      deliveryChannels: NotificationDeliveryChannel[];
      fingerprint: string;
      legacyFingerprint: string | null;
      recipients: ResolvedRecipient[];
      rendered: { title: string; body: string; href: string | null };
    };

export async function buildNotificationPublicationCommand(input: {
  source: NotificationPublicationSource;
  request: unknown;
  deliveryChannels?: readonly NotificationDeliveryChannel[];
}): Promise<DomainValidationResult<NotificationPublicationCommand>> {
  const source = notificationPublicationSourceSchema.safeParse(input.source);
  if (!source.success) return failCommand(source.error.issues[0]?.message ?? "通知来源无效", 400, "source");
  const request = notificationPublicationRequestSchema.safeParse(input.request);
  if (!request.success) return failCommand(request.error.issues[0]?.message ?? "通知发布请求无效", 400);
  const deliveryChannels = normalizeDeliveryChannels(input.deliveryChannels);
  if (!deliveryChannels.ok) return deliveryChannels;
  const normalizedRequest: NotificationPublicationRequest = {
    ...request.data,
    usernames: [...new Set(request.data.usernames)].sort(compareText),
    variables: Object.fromEntries(Object.entries(request.data.variables).sort(([left], [right]) => compareText(left, right))),
  };
  const fingerprint = canonicalNotificationPublicationFingerprint(source.data, {
    ...normalizedRequest,
    deliveryChannels: deliveryChannels.data,
  });
  const legacyFingerprint = deliveryChannels.data.length === 1 && deliveryChannels.data[0] === "workspace"
    ? legacyNotificationPublicationFingerprint(source.data, normalizedRequest)
    : null;
  const existing = await prisma.notificationPublication.findUnique({
    where: {
      sourceKind_sourceId_idempotencyKey: {
        sourceKind: source.data.kind,
        sourceId: source.data.id,
        idempotencyKey: normalizedRequest.idempotencyKey,
      },
    },
  });
  if (existing) {
    return fingerprintMatches(existing.fingerprint, fingerprint, legacyFingerprint)
      ? okCommand({ kind: "replay", source: source.data, fingerprint, receipt: publicationReceipt(existing, true) })
      : failCommand("幂等键已用于不同的通知发布请求", 409, "idempotencyKey");
  }
  const definition = await resolvePublishedDefinition(normalizedRequest.definitionKey);
  if (!definition) return failCommand("通知定义不存在、未发布或已归档", 404, "definitionKey");
  const sourceAccess = canSourceUseDefinition(source.data, definition);
  if (!sourceAccess.ok) return sourceAccess;
  const rendered = renderNotificationDefinition(definition, normalizedRequest.variables);
  if (!rendered.ok) return rendered;
  const recipients = await prisma.user.findMany({
    where: { username: { in: normalizedRequest.usernames }, canLogin: true },
    select: { id: true, username: true, wxUserId: true },
  });
  const recipientByUsername = new Map(recipients.map((recipient) => [recipient.username, recipient]));
  const invalidUsernames = normalizedRequest.usernames.filter((username) => !recipientByUsername.has(username));
  if (invalidUsernames.length > 0) {
    return failCommand(`通知收件人不存在或已停用：${invalidUsernames.join("、")}`, 400, "usernames");
  }
  const orderedRecipients = normalizedRequest.usernames.map((username) => recipientByUsername.get(username)!);
  const rateLimit = await notificationPublicationRateLimit(prisma, {
    source: source.data,
    requestedRecipientCount: orderedRecipients.length,
    now: new Date(),
  });
  if (rateLimit) {
    return failCommand(
      `每个通知来源每分钟最多投递 ${RECIPIENTS_PER_SOURCE_PER_MINUTE} 人`,
      429,
      "usernames",
      rateLimit,
    );
  }
  return okCommand({
    kind: "publish",
    source: source.data,
    definition,
    request: normalizedRequest,
    deliveryChannels: deliveryChannels.data,
    fingerprint,
    legacyFingerprint,
    recipients: orderedRecipients,
    rendered: rendered.data,
  });
}

export async function commitNotificationPublication(
  command: NotificationPublicationCommand,
  projectionWriter: NotificationProjectionWriter,
  commitGuard?: NotificationPublicationCommitGuard,
): Promise<ServiceResult<NotificationPublicationReceipt>> {
  if (command.kind === "replay") return serviceOk(command.receipt);
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`notification-publication:${command.source.kind}:${command.source.id}`}, 0))::text AS lock_result`,
      );
      const existing = await tx.notificationPublication.findUnique({
        where: {
          sourceKind_sourceId_idempotencyKey: {
            sourceKind: command.source.kind,
            sourceId: command.source.id,
            idempotencyKey: command.request.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (!fingerprintMatches(existing.fingerprint, command.fingerprint, command.legacyFingerprint)) {
          throw new PublicationCommitIssue("idempotency-conflict");
        }
        return publicationReceipt(existing, true);
      }
      if (commitGuard && !(await commitGuard(tx))) {
        throw new PublicationCommitIssue("commit-guard-rejected");
      }
      const [definitionHead] = await tx.$queryRaw<Array<{
        id: number;
        status: string;
        publishedRevision: number | null;
      }>>(Prisma.sql`
        SELECT "id", "status", "publishedRevision"
        FROM "NotificationDefinition"
        WHERE "id" = ${command.definition.id}
        FOR SHARE
      `);
      if (
        !definitionHead
        || definitionHead.status !== "active"
        || definitionHead.publishedRevision !== command.definition.revision
      ) {
        throw new PublicationCommitIssue("definition-changed");
      }
      const revision = await tx.notificationDefinitionRevision.findUnique({
        where: {
          definitionId_revision: {
            definitionId: command.definition.id,
            revision: command.definition.revision,
          },
        },
      });
      if (!revision || revision.key !== command.request.definitionKey) {
        throw new PublicationCommitIssue("definition-changed");
      }
      const liveDefinition: PublishedDefinition = {
        id: command.definition.id,
        key: revision.key,
        revision: revision.revision,
        label: revision.label,
        description: revision.description,
        titleTemplate: revision.titleTemplate,
        bodyTemplate: revision.bodyTemplate,
        hrefTemplate: revision.hrefTemplate,
        responseMode: revision.responseMode === "acknowledge" ? "acknowledge" : "read",
        isImportant: revision.isImportant,
        allowProjectMonitoring: revision.allowProjectMonitoring,
        variableKeys: parseStringArray(revision.variableKeysJson),
        allowUserApi: revision.allowUserApi,
        allowedOpenApiClientIds: parseNumberArray(revision.allowedOpenApiClientIdsJson),
      };
      if (!canSourceUseDefinition(command.source, liveDefinition).ok) {
        throw new PublicationCommitIssue("source-forbidden");
      }
      const rendered = renderNotificationDefinition(liveDefinition, command.request.variables);
      if (!rendered.ok) throw new PublicationCommitIssue("definition-changed");
      const lockedRecipients = await tx.$queryRaw<ResolvedRecipient[]>(Prisma.sql`
        SELECT "id", "username", "wxUserId"
        FROM "User"
        WHERE "username" IN (${Prisma.join(command.request.usernames)})
          AND "canLogin" IS TRUE
        FOR SHARE
      `);
      const recipientByUsername = new Map(lockedRecipients.map((recipient) => [recipient.username, recipient]));
      if (command.request.usernames.some((username) => !recipientByUsername.has(username))) {
        throw new PublicationCommitIssue("recipients-changed");
      }
      const recipients = command.request.usernames.map((username) => recipientByUsername.get(username)!);
      const rateLimit = await notificationPublicationRateLimit(tx, {
        source: command.source,
        requestedRecipientCount: recipients.length,
        now: new Date(),
      });
      if (rateLimit) {
        throw new PublicationCommitIssue("rate-limited", rateLimit);
      }
      const endpoint = command.deliveryChannels.includes("wecom")
        ? await ensureWecomNotificationEndpoint(tx)
        : null;
      const now = new Date();
      const workspaceDeliveryCount = command.deliveryChannels.includes("workspace") ? recipients.length : 0;
      const wecomBoundCount = command.deliveryChannels.includes("wecom")
        ? recipients.filter((recipient) => Boolean(recipient.wxUserId?.trim())).length
        : 0;
      const wecomUnboundCount = command.deliveryChannels.includes("wecom")
        ? recipients.length - wecomBoundCount
        : 0;
      const pendingDeliveryCount = wecomBoundCount;
      const deliveredDeliveryCount = workspaceDeliveryCount;
      const failedDeliveryCount = wecomUnboundCount;
      const deliveryCount = recipients.length * command.deliveryChannels.length;
      const publicationStatus = deriveNotificationPublicationStatus({
        channels: command.deliveryChannels,
        pending: pendingDeliveryCount,
        delivered: deliveredDeliveryCount,
        failed: failedDeliveryCount,
      });
      const publication = await tx.notificationPublication.create({
        data: {
          definitionId: command.definition.id,
          definitionKey: command.definition.key,
          definitionRevision: command.definition.revision,
          sourceKind: command.source.kind,
          sourceId: command.source.id,
          sourceLabel: command.source.label,
          idempotencyKey: command.request.idempotencyKey,
          fingerprint: command.fingerprint,
          audienceJson: JSON.stringify({
            usernames: command.request.usernames,
            deliveryChannels: command.deliveryChannels,
          }),
          status: publicationStatus,
          recipientCount: recipients.length,
          deliveryCount,
          pendingDeliveryCount,
          deliveredDeliveryCount,
          failedDeliveryCount,
        },
      });
      for (const recipient of recipients) {
        if (command.deliveryChannels.includes("workspace")) {
          const notification = await projectionWriter({
            recipientUserId: recipient.id,
            type: CUSTOM_NOTIFICATION_TYPE,
            title: rendered.data.title,
            body: rendered.data.body,
            href: rendered.data.href,
            payload: {
              publicationId: publication.id,
              definitionKey: liveDefinition.key,
              revision: liveDefinition.revision,
            },
            recipientReason: `来自「${command.source.label}」的配置化通知`,
            dispatchId: publication.id,
            isImportant: liveDefinition.isImportant,
            requiresAcknowledgement: liveDefinition.responseMode === "acknowledge",
            responseMode: liveDefinition.responseMode,
          }, tx);
          await tx.notificationDelivery.create({
            data: {
              publicationId: publication.id,
              recipientUserId: recipient.id,
              recipientUsername: recipient.username,
              channel: "workspace",
              destination: recipient.username,
              title: rendered.data.title,
              body: rendered.data.body,
              href: rendered.data.href,
              status: "delivered",
              notificationId: notification.id,
              deliveredAt: now,
            },
          });
        }
        if (command.deliveryChannels.includes("wecom")) {
          const destination = recipient.wxUserId?.trim() || null;
          await tx.notificationDelivery.create({
            data: {
              publicationId: publication.id,
              recipientUserId: recipient.id,
              recipientUsername: recipient.username,
              channel: "wecom",
              endpointId: endpoint!.id,
              destination,
              title: rendered.data.title,
              body: rendered.data.body,
              href: rendered.data.href,
              status: destination ? "pending" : "failed",
              nextAttemptAt: destination ? now : null,
              failedAt: destination ? null : now,
              lastErrorCode: destination ? null : "WECOM_USER_UNBOUND",
              lastErrorSummary: destination ? null : "收件人未绑定企业微信账号",
            },
          });
        }
      }
      return publicationReceipt(publication, false);
    });
    return serviceOk(result);
  } catch (error) {
    if (error instanceof PublicationCommitIssue) {
      if (error.kind === "rate-limited") {
        return serviceError(
          `每个通知来源每分钟最多投递 ${RECIPIENTS_PER_SOURCE_PER_MINUTE} 人`,
          429,
          error.rateLimitDetails,
        );
      }
      if (error.kind === "source-forbidden") {
        return serviceError("该通知定义不再授权给当前通知来源", 403);
      }
      if (error.kind === "recipients-changed") {
        return serviceError("通知收件人已不存在或被停用，请刷新后重试", 400);
      }
      if (error.kind === "definition-changed") {
        return serviceError("通知定义的发布状态已变化，请刷新后重试", 409);
      }
      if (error.kind === "commit-guard-rejected") {
        return serviceError("通知发布资格已失效，请刷新后重试", 409, {
          code: NOTIFICATION_PUBLICATION_COMMIT_GUARD_REJECTED,
        });
      }
      return serviceError("幂等键已用于不同的通知发布请求", 409);
    }
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.notificationPublication.findUnique({
        where: {
          sourceKind_sourceId_idempotencyKey: {
            sourceKind: command.source.kind,
            sourceId: command.source.id,
            idempotencyKey: command.request.idempotencyKey,
          },
        },
      });
      if (existing && fingerprintMatches(existing.fingerprint, command.fingerprint, command.legacyFingerprint)) {
        return serviceOk(publicationReceipt(existing, true));
      }
      if (existing) return serviceError("幂等键已用于不同的通知发布请求", 409);
    }
    console.error("Failed to commit configured notification publication", error);
    return serviceError("通知发布失败", 500);
  }
}

function publicationReceipt(row: {
  id: string;
  definitionKey: string;
  definitionRevision: number;
  status: string;
  recipientCount: number;
  deliveryCount: number;
  pendingDeliveryCount: number;
  deliveredDeliveryCount: number;
  failedDeliveryCount: number;
  createdAt: Date;
}, replayed: boolean): NotificationPublicationReceipt {
  return {
    publicationId: row.id,
    definitionKey: row.definitionKey,
    revision: row.definitionRevision,
    replayed,
    recipientCount: row.recipientCount,
    deliveryCount: row.deliveryCount,
    status: row.status,
    pendingDeliveryCount: row.pendingDeliveryCount,
    deliveredDeliveryCount: row.deliveredDeliveryCount,
    failedDeliveryCount: row.failedDeliveryCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function normalizeDeliveryChannels(
  value: readonly NotificationDeliveryChannel[] | undefined,
): DomainValidationResult<NotificationDeliveryChannel[]> {
  const raw = value ?? ["workspace"];
  if (
    !Array.isArray(raw)
    || raw.length === 0
    || raw.some((channel) => channel !== "workspace" && channel !== "wecom")
  ) {
    return failCommand("通知投递渠道无效", 400, "deliveryChannels");
  }
  return okCommand([...new Set(raw)].sort(compareText));
}

function fingerprintMatches(stored: string, current: string, legacy: string | null) {
  return stored === current || (legacy !== null && stored === legacy);
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseNumberArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is number => Number.isInteger(item) && item > 0) : [];
  } catch {
    return [];
  }
}

class PublicationCommitIssue extends Error {
  constructor(
    readonly kind:
      | "rate-limited"
      | "idempotency-conflict"
      | "definition-changed"
      | "source-forbidden"
      | "recipients-changed"
      | "commit-guard-rejected",
    readonly rateLimitDetails?: NotificationPublicationRateLimitDetails,
  ) {
    super(kind);
  }
}
