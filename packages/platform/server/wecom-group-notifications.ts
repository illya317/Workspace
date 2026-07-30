import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { serviceError, serviceOk } from "../service-result";
import { renderNotificationDefinition } from "./notification-definition-dsl";
import {
  ensureWecomNotificationEndpoint,
  validateNotificationDeliveryChannelsForActivation,
} from "./notification-delivery-outbox";
import { prisma, Prisma } from "./prisma";
import { resolvePublishedDefinition } from "./notification-publishing-storage";
import { evaluatePermissionAction } from "./rbac/action-grants";
import {
  managedGroupClaimSchema,
  managedGroupStatusSchema,
  managedGroupUpdateSchema,
  managedGroupVerifySchema,
  notificationGroupPolicyCreateSchema,
  notificationGroupPolicyUpdateSchema,
  notificationGroupPublicationSchema,
  type NotificationGroupDataScope,
  type NotificationManagedGroupStatus,
} from "./wecom-group-notification-contract";

export {
  managedGroupClaimSchema,
  managedGroupStatusSchema,
  managedGroupUpdateSchema,
  managedGroupVerificationStatusSchema,
  managedGroupVerifySchema,
  notificationGroupDataScopeSchema,
  notificationGroupPolicyCreateSchema,
  notificationGroupPolicyUpdateSchema,
  notificationGroupPublicationSchema,
  notificationGroupScheduleSchema,
  weeklyAgentKeySchema,
} from "./wecom-group-notification-contract";
export { listWecomGroupNotificationConsoleData } from "./wecom-group-notification-console";


type GroupRow = {
  id: number;
  groupKey: string;
  displayName: string | null;
  status: string;
  ownerUserId: number | null;
  ownerUsername: string | null;
  ownerAlias: string | null;
  ownerPositionId: number | null;
  ownerPositionName: string | null;
  verificationStatus: string;
  discoveredAt: Date;
  lastSeenAt: Date;
  lastVerifiedAt: Date | null;
  version: number;
};

type PolicyRow = {
  id: string;
  key: string;
  groupId: number;
  groupKey: string;
  groupDisplayName: string | null;
  definitionKey: string;
  label: string;
  dataScopeJson: string;
  scheduleJson: string;
  weeklyAgentKey: string | null;
  enabled: boolean;
  version: number;
  updatedAt: Date;
  lastDeliveryId: number | null;
  lastDeliveryStatus: string | null;
  lastDeliveryAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureCode: string | null;
  lastFailureSummary: string | null;
};

const exactGrantOptions = {
  grantMatch: { action: "exact" as const, resource: "exact" as const },
};

export async function observeWecomManagedGroup(providerConversationRef: string) {
  const normalized = providerConversationRef.trim();
  if (!normalized || normalized.length > 256) throw new Error("企业微信群会话标识无效");
  const groupKey = managedGroupKey(normalized);
  const rows = await prisma.$queryRaw<Array<{ groupKey: string }>>(Prisma.sql`
    INSERT INTO "NotificationManagedGroup" (
      "groupKey", "provider", "providerConversationRef", "status",
      "verificationStatus", "discoveredAt", "lastSeenAt", "createdAt", "updatedAt"
    )
    VALUES (
      ${groupKey}, 'wecom', ${normalized}, 'discovered',
      'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("provider", "providerConversationRef")
    DO UPDATE SET "lastSeenAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "groupKey"
  `);
  return { groupKey: rows[0]?.groupKey ?? groupKey };
}

export async function claimWecomManagedGroup(
  userId: number,
  groupKey: string,
  input: z.infer<typeof managedGroupClaimSchema>,
) {
  if (!await notificationPermission(userId, "configure")) return serviceError("无权限", 403);
  const ownerError = await validateOwner(input.ownerUserId ?? null, input.ownerPositionId ?? null);
  if (ownerError) return serviceError(ownerError, 400);
  const rows = await prisma.$queryRaw<GroupRow[]>(Prisma.sql`
    UPDATE "NotificationManagedGroup"
    SET
      "displayName" = ${input.displayName},
      "ownerUserId" = ${input.ownerUserId ?? null},
      "ownerPositionId" = ${input.ownerPositionId ?? null},
      "status" = CASE WHEN "verificationStatus" = 'verified' THEN 'active' ELSE 'unclaimed' END,
      "claimedAt" = CURRENT_TIMESTAMP,
      "claimedByUserId" = ${userId},
      "version" = "version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "groupKey" = ${groupKey}
      AND "version" = ${input.expectedVersion}
    RETURNING *
  `);
  if (rows[0]) return serviceOk({ groupKey, version: rows[0].version, status: groupStatus(rows[0].status) });
  return staleOrMissingGroup(groupKey);
}

export async function verifyWecomManagedGroup(
  userId: number,
  groupKey: string,
  input: z.infer<typeof managedGroupVerifySchema>,
) {
  if (!await notificationPermission(userId, "configure")) return serviceError("无权限", 403);
  const rows = await prisma.$queryRaw<GroupRow[]>(Prisma.sql`
    UPDATE "NotificationManagedGroup"
    SET
      "verificationStatus" = 'verified',
      "lastVerifiedAt" = CURRENT_TIMESTAMP,
      "status" = CASE
        WHEN "displayName" IS NOT NULL AND ("ownerUserId" IS NOT NULL OR "ownerPositionId" IS NOT NULL)
        THEN 'active'
        ELSE 'unclaimed'
      END,
      "version" = "version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "groupKey" = ${groupKey}
      AND "version" = ${input.expectedVersion}
      AND "lastSeenAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    RETURNING *
  `);
  if (rows[0]) return serviceOk({ groupKey, version: rows[0].version, status: groupStatus(rows[0].status), verificationStatus: "verified" });
  const exists = await managedGroupExists(groupKey);
  return exists
    ? serviceError("群版本已变化或最近 30 天没有 Bot 观测记录，请刷新后重试", 409)
    : serviceError("企业微信群不存在", 404);
}

export async function updateWecomManagedGroup(
  userId: number,
  groupKey: string,
  input: z.infer<typeof managedGroupUpdateSchema>,
) {
  if (!await notificationPermission(userId, "configure")) return serviceError("无权限", 403);
  const currentRows = await prisma.$queryRaw<GroupRow[]>(Prisma.sql`
    SELECT * FROM "NotificationManagedGroup" WHERE "groupKey" = ${groupKey} LIMIT 1
  `);
  const current = currentRows[0];
  if (!current) return serviceError("企业微信群不存在", 404);
  if (current.version !== input.expectedVersion) return serviceError("群版本已变化，请刷新后重试", 409);
  if (
    input.status === "active"
    && (
      current.verificationStatus !== "verified"
      || !(current.ownerUserId || current.ownerPositionId)
      || !(input.displayName ?? current.displayName)
    )
  ) {
    return serviceError("群必须已认领、命名并验证后才能启用", 409);
  }
  const nextDisplayName = input.displayName ?? current.displayName;
  const nextStatus = input.status ?? groupStatus(current.status);
  const rows = await prisma.$queryRaw<Array<{ version: number }>>(Prisma.sql`
    UPDATE "NotificationManagedGroup"
    SET
      "displayName" = ${nextDisplayName},
      "status" = ${nextStatus},
      "version" = "version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "groupKey" = ${groupKey} AND "version" = ${input.expectedVersion}
    RETURNING "version"
  `);
  return rows[0]
    ? serviceOk({ groupKey, status: nextStatus, version: rows[0].version })
    : serviceError("群版本已变化，请刷新后重试", 409);
}

export async function createNotificationGroupPolicy(
  userId: number,
  input: z.infer<typeof notificationGroupPolicyCreateSchema>,
) {
  if (!await notificationPermission(userId, "configure")) return serviceError("无权限", 403);
  const readiness = await validatePolicyReferences(input.groupKey, input.definitionKey, input.enabled);
  if (readiness.ok === false) return readiness;
  const id = randomUUID();
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "NotificationGroupPolicy" (
        "id", "key", "groupId", "definitionKey", "label", "dataScopeJson",
        "scheduleJson", "weeklyAgentKey", "enabled", "version",
        "createdByUserId", "updatedByUserId", "createdAt", "updatedAt"
      )
      SELECT
        ${id}, ${input.key}, group_row."id", ${input.definitionKey}, ${input.label},
        ${JSON.stringify(input.dataScope)}, ${JSON.stringify(input.schedule)},
        ${input.weeklyAgentKey ?? null}, ${input.enabled}, 1,
        ${userId}, ${userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "NotificationManagedGroup" AS group_row
      WHERE group_row."groupKey" = ${input.groupKey}
    `);
  } catch (error) {
    if (isUniqueConstraintError(error)) return serviceError("策略键已存在", 409);
    throw error;
  }
  return serviceOk({ id, key: input.key, version: 1 });
}

export async function updateNotificationGroupPolicy(
  userId: number,
  policyId: string,
  input: z.infer<typeof notificationGroupPolicyUpdateSchema>,
) {
  if (!await notificationPermission(userId, "configure")) return serviceError("无权限", 403);
  const rows = await prisma.$queryRaw<PolicyRow[]>(Prisma.sql`
    SELECT
      policy.*, group_row."groupKey", group_row."displayName" AS "groupDisplayName",
      NULL::integer AS "lastDeliveryId", NULL::text AS "lastDeliveryStatus",
      NULL::timestamp AS "lastDeliveryAt", NULL::timestamp AS "lastFailureAt",
      NULL::text AS "lastFailureCode", NULL::text AS "lastFailureSummary"
    FROM "NotificationGroupPolicy" AS policy
    INNER JOIN "NotificationManagedGroup" AS group_row ON group_row."id" = policy."groupId"
    WHERE policy."id" = ${policyId}
    LIMIT 1
  `);
  const current = rows[0];
  if (!current) return serviceError("群发策略不存在", 404);
  if (current.version !== input.expectedVersion) return serviceError("策略版本已变化，请刷新后重试", 409);
  const definitionKey = input.definitionKey ?? current.definitionKey;
  const enabled = input.enabled ?? current.enabled;
  const readiness = await validatePolicyReferences(current.groupKey, definitionKey, enabled);
  if (readiness.ok === false) return readiness;
  const label = input.label ?? current.label;
  const dataScopeJson = input.dataScope ? JSON.stringify(input.dataScope) : current.dataScopeJson;
  const scheduleJson = input.schedule ? JSON.stringify(input.schedule) : current.scheduleJson;
  const weeklyAgentKey = input.weeklyAgentKey === undefined ? current.weeklyAgentKey : input.weeklyAgentKey;
  const updated = await prisma.$queryRaw<Array<{ version: number }>>(Prisma.sql`
    UPDATE "NotificationGroupPolicy"
    SET
      "definitionKey" = ${definitionKey},
      "label" = ${label},
      "dataScopeJson" = ${dataScopeJson},
      "scheduleJson" = ${scheduleJson},
      "weeklyAgentKey" = ${weeklyAgentKey},
      "enabled" = ${enabled},
      "version" = "version" + 1,
      "updatedByUserId" = ${userId},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${policyId} AND "version" = ${input.expectedVersion}
    RETURNING "version"
  `);
  return updated[0]
    ? serviceOk({ id: policyId, version: updated[0].version })
    : serviceError("策略版本已变化，请刷新后重试", 409);
}

export async function publishNotificationToManagedGroup(
  userId: number,
  input: z.infer<typeof notificationGroupPublicationSchema>,
  idempotencyKey: string,
) {
  if (!await notificationPermission(userId, "create")) return serviceError("无权限", 403);
  const normalizedIdempotencyKey = idempotencyKey.trim();
  if (!normalizedIdempotencyKey || normalizedIdempotencyKey.length > 240) {
    return serviceError("Idempotency-Key 无效", 400);
  }
  const rows = await prisma.$queryRaw<Array<PolicyRow & {
    providerConversationRef: string;
    groupStatus: string;
    verificationStatus: string;
  }>>(Prisma.sql`
    SELECT
      policy.*, group_row."groupKey", group_row."displayName" AS "groupDisplayName",
      group_row."providerConversationRef", group_row."status" AS "groupStatus",
      group_row."verificationStatus",
      NULL::integer AS "lastDeliveryId", NULL::text AS "lastDeliveryStatus",
      NULL::timestamp AS "lastDeliveryAt", NULL::timestamp AS "lastFailureAt",
      NULL::text AS "lastFailureCode", NULL::text AS "lastFailureSummary"
    FROM "NotificationGroupPolicy" AS policy
    INNER JOIN "NotificationManagedGroup" AS group_row ON group_row."id" = policy."groupId"
    WHERE policy."id" = ${input.policyId}
    LIMIT 1
  `);
  const policy = rows[0];
  if (!policy) return serviceError("群发策略不存在", 404);
  if (!policy.enabled || policy.groupStatus !== "active" || policy.verificationStatus !== "verified") {
    return serviceError("群或群发策略未启用并验证", 409);
  }
  const definition = await resolvePublishedDefinition(policy.definitionKey);
  if (!definition) return serviceError("策略绑定的通知定义不存在、未发布或已归档", 409);
  const rendered = renderNotificationDefinition(definition, input.variables);
  if (rendered.ok === false) return serviceError(rendered.issue.message, rendered.issue.status);
  const sourceId = `notification-group-policy:${policy.id}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({
    policyId: policy.id,
    groupKey: policy.groupKey,
    definitionKey: definition.key,
    revision: definition.revision,
    variables: Object.fromEntries(Object.entries(input.variables).sort(([a], [b]) => a.localeCompare(b))),
  })).digest("hex");

  try {
    const receipt = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${`notification-group-policy:${policy.id}`}, 0))::text AS lock_result
      `);
      const existing = await tx.notificationPublication.findUnique({
        where: {
          sourceKind_sourceId_idempotencyKey: {
            sourceKind: "internal",
            sourceId,
            idempotencyKey: normalizedIdempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new GroupPublicationIssue("idempotency-conflict");
        return toGroupPublicationReceipt(existing, policy.id, true);
      }
      const liveRows = await tx.$queryRaw<Array<{
        enabled: boolean;
        groupKey: string;
        providerConversationRef: string;
        groupStatus: string;
        verificationStatus: string;
      }>>(Prisma.sql`
        SELECT
          policy."enabled", group_row."groupKey", group_row."providerConversationRef",
          group_row."status" AS "groupStatus", group_row."verificationStatus"
        FROM "NotificationGroupPolicy" AS policy
        INNER JOIN "NotificationManagedGroup" AS group_row ON group_row."id" = policy."groupId"
        WHERE policy."id" = ${policy.id}
        FOR SHARE OF policy, group_row
      `);
      const live = liveRows[0];
      if (!live || !live.enabled || live.groupStatus !== "active" || live.verificationStatus !== "verified") {
        throw new GroupPublicationIssue("policy-disabled");
      }
      const endpoint = await ensureWecomNotificationEndpoint(tx);
      const now = new Date();
      const publication = await tx.notificationPublication.create({
        data: {
          definitionId: definition.id,
          definitionKey: definition.key,
          definitionRevision: definition.revision,
          sourceKind: "internal",
          sourceId,
          sourceLabel: `群发策略：${policy.label}`,
          idempotencyKey: normalizedIdempotencyKey,
          fingerprint,
          audienceJson: JSON.stringify({
            type: "managed-wecom-group",
            groupKey: live.groupKey,
            policyId: policy.id,
            dataScope: parseJson<NotificationGroupDataScope>(policy.dataScopeJson, { type: "workspace", ids: [], label: "全 Workspace" }),
          }),
          status: "processing",
          recipientCount: 1,
          deliveryCount: 1,
          pendingDeliveryCount: 1,
          deliveredDeliveryCount: 0,
          failedDeliveryCount: 0,
        },
      });
      await tx.notificationDelivery.create({
        data: {
          publicationId: publication.id,
          recipientUserId: null,
          recipientUsername: `group:${live.groupKey}`,
          channel: "wecom",
          endpointId: endpoint.id,
          destination: live.providerConversationRef,
          title: rendered.data.title,
          body: rendered.data.body,
          href: rendered.data.href,
          status: "pending",
          nextAttemptAt: now,
        },
      });
      return toGroupPublicationReceipt(publication, policy.id, false);
    });
    return serviceOk(receipt);
  } catch (error) {
    if (error instanceof GroupPublicationIssue) {
      return serviceError(
        error.kind === "policy-disabled"
          ? "群或群发策略状态已变化，请刷新后重试"
          : "幂等键已用于不同群发请求",
        409,
      );
    }
    throw error;
  }
}

async function validatePolicyReferences(groupKey: string, definitionKey: string, enabled: boolean) {
  const groups = await prisma.$queryRaw<Array<{
    status: string;
    verificationStatus: string;
  }>>(Prisma.sql`
    SELECT "status", "verificationStatus"
    FROM "NotificationManagedGroup"
    WHERE "groupKey" = ${groupKey}
    LIMIT 1
  `);
  const group = groups[0];
  if (!group) return serviceError("企业微信群不存在", 404);
  if (!await resolvePublishedDefinition(definitionKey)) {
    return serviceError("通知定义不存在、未发布或已归档", 400);
  }
  if (enabled && (group.status !== "active" || group.verificationStatus !== "verified")) {
    return serviceError("群必须已认领、命名并验证后才能启用策略", 409);
  }
  if (enabled) {
    const capability = await validateNotificationDeliveryChannelsForActivation(["wecom"]);
    if (capability.ok === false) return serviceError(capability.issue.message, capability.issue.status);
  }
  return serviceOk(true);
}

async function validateOwner(ownerUserId: number | null, ownerPositionId: number | null) {
  const [user, position] = await Promise.all([
    ownerUserId ? prisma.user.findUnique({ where: { id: ownerUserId }, select: { id: true } }) : null,
    ownerPositionId ? prisma.position.findUnique({ where: { id: ownerPositionId }, select: { id: true } }) : null,
  ]);
  if (ownerUserId && !user) return "群负责人用户不存在";
  if (ownerPositionId && !position) return "群负责人岗位不存在";
  return null;
}

async function staleOrMissingGroup(groupKey: string) {
  return await managedGroupExists(groupKey)
    ? serviceError("群版本已变化，请刷新后重试", 409)
    : serviceError("企业微信群不存在", 404);
}

async function managedGroupExists(groupKey: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT EXISTS(
      SELECT 1 FROM "NotificationManagedGroup" WHERE "groupKey" = ${groupKey}
    ) AS "exists"
  `);
  return rows[0]?.exists ?? false;
}

function notificationPermission(userId: number, action: "read" | "configure" | "audit" | "create") {
  return evaluatePermissionAction(userId, "settings.notifications", action, exactGrantOptions);
}

function managedGroupKey(providerConversationRef: string) {
  return `wecom.group.${createHash("sha256").update(providerConversationRef).digest("hex").slice(0, 20)}`;
}

function groupStatus(value: string): NotificationManagedGroupStatus {
  return managedGroupStatusSchema.safeParse(value).success ? value as NotificationManagedGroupStatus : "suspended";
}


function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}


export function toGroupPublicationReceipt(row: {
  id: string;
  definitionKey: string;
  definitionRevision: number;
  status: string;
  createdAt: Date;
}, policyId: string, replayed: boolean) {
  return {
    publicationId: row.id,
    policyId,
    definitionKey: row.definitionKey,
    revision: row.definitionRevision,
    status: row.status,
    replayed,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}

class GroupPublicationIssue extends Error {
  constructor(readonly kind: "idempotency-conflict" | "policy-disabled") {
    super(kind);
  }
}
