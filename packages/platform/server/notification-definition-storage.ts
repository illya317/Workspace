import "server-only";

import { randomUUID } from "node:crypto";

import { serviceError, serviceOk, type ServiceResult } from "../service-result";
import {
  notificationDefinitionSaveSchema,
  notificationPublicationSourceSchema,
  prepareNotificationDefinition,
  type NotificationPublicationSource,
  type PreparedNotificationDefinition,
} from "./notification-definition-dsl";
import { validateImmutableNotificationDefinitionKey } from "./notification-definition-governance";
import { failCommand, okCommand, type DomainValidationResult } from "./domain-validation";
import { Prisma, prisma } from "./prisma";
import {
  parseNumberArray,
  parseStringArray,
  responseMode,
  toDefinitionDto,
  type NotificationDefinitionDto,
  type NotificationDefinitionLifecycleAction,
  type PublishedDefinition,
  type PublishedNotificationDefinitionDto,
} from "./notification-publishing-storage-contract";

export async function listNotificationDefinitionManagementRows(): Promise<NotificationDefinitionDto[]> {
  const rows = await prisma.notificationDefinition.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return rows.map(toDefinitionDto);
}

export async function listPublishedNotificationDefinitionConsoleRows(): Promise<NotificationDefinitionDto[]> {
  const heads = await prisma.notificationDefinition.findMany({
    where: { status: "active", publishedRevision: { not: null } },
    orderBy: { key: "asc" },
    select: { id: true, publishedRevision: true, publishedAt: true, createdAt: true },
  });
  const revisionCoordinates = heads.flatMap((head) => head.publishedRevision === null
    ? []
    : [{ definitionId: head.id, revision: head.publishedRevision }]);
  if (revisionCoordinates.length === 0) return [];
  const revisions = await prisma.notificationDefinitionRevision.findMany({
    where: { OR: revisionCoordinates },
  });
  const revisionByCoordinate = new Map(
    revisions.map((revision) => [`${revision.definitionId}:${revision.revision}`, revision]),
  );
  return heads.flatMap((head) => {
    if (head.publishedRevision === null) return [];
    const revision = revisionByCoordinate.get(`${head.id}:${head.publishedRevision}`);
    if (!revision) return [];
    // Preserve the workbench row shape without exposing source grants or mutable head metadata.
    return [toDefinitionDto({
      id: head.id,
      key: revision.key,
      label: revision.label,
      description: revision.description,
      titleTemplate: revision.titleTemplate,
      bodyTemplate: revision.bodyTemplate,
      hrefTemplate: revision.hrefTemplate,
      responseMode: revision.responseMode,
      isImportant: revision.isImportant,
      allowProjectMonitoring: revision.allowProjectMonitoring,
      variableKeysJson: revision.variableKeysJson,
      allowUserApi: false,
      allowedOpenApiClientIdsJson: "[]",
      status: "active",
      revision: revision.revision,
      publishedRevision: revision.revision,
      version: revision.revision,
      publishedAt: head.publishedAt,
      archivedAt: null,
      createdAt: head.createdAt,
      updatedAt: head.publishedAt ?? revision.createdAt,
    })];
  });
}

export async function saveNotificationDefinition(
  userId: number,
  input: unknown,
): Promise<ServiceResult<NotificationDefinitionDto>> {
  const parsed = notificationDefinitionSaveSchema.safeParse(input);
  if (!parsed.success) return serviceError(parsed.error.issues[0]?.message ?? "通知定义无效", 400);
  const prepared = prepareNotificationDefinition(parsed.data);
  if (!prepared.ok) return serviceError(prepared.issue.message, prepared.issue.status, fieldDetails(prepared.issue.field));
  try {
    const allowedClients = prepared.data.allowedOpenApiClientIds.length === 0
      ? []
      : await prisma.openApiClient.findMany({
          where: { id: { in: prepared.data.allowedOpenApiClientIds } },
          select: { id: true },
        });
    const allowedClientIds = new Set(allowedClients.map((client) => client.id));
    const missingClientIds = prepared.data.allowedOpenApiClientIds.filter((id) => !allowedClientIds.has(id));
    if (missingClientIds.length > 0) {
      return serviceError(`Open API Client 不存在：${missingClientIds.join("、")}`, 400, {
        field: "allowedOpenApiClientIds",
      });
    }
    if (parsed.data.id) {
      return saveExistingDefinition(userId, parsed.data.id, parsed.data.expectedVersion!, prepared.data);
    }
    return await prisma.$transaction(async (tx) => {
      const definition = await tx.notificationDefinition.create({
        data: definitionCreateData(userId, prepared.data),
      });
      await tx.notificationDefinitionRevision.create({
        data: definitionRevisionData(definition.id, 1, userId, prepared.data),
      });
      await appendLifecycleEvent(tx, {
        definitionId: definition.id,
        revision: 1,
        action: "created",
        actorUserId: userId,
        occurredAt: definition.createdAt,
        priorVersion: 0,
      });
      return serviceOk(toDefinitionDto(definition));
    });
  } catch (error) {
    return isUniqueConstraintError(error)
      ? serviceError("通知定义 key 已存在", 409)
      : definitionStorageError("保存通知定义失败", error);
  }
}

export async function publishNotificationDefinition(
  userId: number,
  definitionKey: string,
  expectedVersion: number,
): Promise<ServiceResult<NotificationDefinitionDto>> {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.notificationDefinition.findUnique({ where: { key: definitionKey } });
      if (!current) return serviceError("通知定义不存在", 404);
      if (current.status !== "active") return serviceError("已归档通知定义不能发布", 409);
      if (current.version !== expectedVersion) return serviceError("通知定义已被其他人修改，请刷新后重试", 409);
      if (current.publishedRevision === current.revision) return serviceError("当前修订已经发布", 409);
      const occurredAt = new Date();
      const updated = await tx.notificationDefinition.updateMany({
        where: { id: current.id, status: "active", version: expectedVersion, revision: current.revision },
        data: {
          publishedRevision: current.revision,
          publishedAt: occurredAt,
          publishedByUserId: userId,
          updatedByUserId: userId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return serviceError("通知定义已被其他人修改，请刷新后重试", 409);
      await appendLifecycleEvent(tx, {
        definitionId: current.id,
        revision: current.revision,
        action: "published",
        actorUserId: userId,
        occurredAt,
        priorVersion: current.version,
      });
      return serviceOk(toDefinitionDto(await requireDefinition(tx, current.id)));
    });
  } catch (error) {
    return definitionStorageError("发布通知定义失败", error);
  }
}

export async function commitNotificationDefinitionArchivedState(
  userId: number,
  definitionKey: string,
  expectedVersion: number,
): Promise<ServiceResult<NotificationDefinitionDto>> {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.notificationDefinition.findUnique({ where: { key: definitionKey } });
      if (!current) return serviceError("通知定义不存在", 404);
      if (current.status !== "active" || current.version !== expectedVersion) {
        return serviceError("通知定义已被其他人修改或已经归档", 409);
      }
      const occurredAt = new Date();
      const updated = await tx.notificationDefinition.updateMany({
        where: { id: current.id, status: "active", version: expectedVersion },
        data: {
          status: "archived",
          archivedAt: occurredAt,
          archivedByUserId: userId,
          updatedByUserId: userId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return serviceError("通知定义已被其他人修改或已经归档", 409);
      await appendLifecycleEvent(tx, {
        definitionId: current.id,
        revision: current.revision,
        action: "archived",
        actorUserId: userId,
        occurredAt,
        priorVersion: current.version,
      });
      return serviceOk(toDefinitionDto(await requireDefinition(tx, current.id)));
    });
  } catch (error) {
    return definitionStorageError("归档通知定义失败", error);
  }
}

export async function listPublishedNotificationDefinitionsForSource(
  source: NotificationPublicationSource,
): Promise<PublishedNotificationDefinitionDto[]> {
  const parsed = notificationPublicationSourceSchema.safeParse(source);
  if (!parsed.success) return [];
  const heads = await prisma.notificationDefinition.findMany({
    where: { status: "active", publishedRevision: { not: null } },
    orderBy: [{ label: "asc" }, { key: "asc" }],
  });
  const definitions = await Promise.all(heads.map((head) => resolvePublishedDefinition(head.key)));
  return definitions
    .filter((definition): definition is PublishedDefinition => Boolean(definition))
    .filter((definition) => canSourceUseDefinition(parsed.data, definition).ok)
    .map((definition) => ({
      id: definition.id,
      key: definition.key,
      label: definition.label,
      description: definition.description,
      revision: definition.revision,
      variableKeys: definition.variableKeys,
      responseMode: definition.responseMode,
      isImportant: definition.isImportant,
      allowProjectMonitoring: definition.allowProjectMonitoring,
    }));
}

export async function resolvePublishedDefinition(key: string): Promise<PublishedDefinition | null> {
  const head = await prisma.notificationDefinition.findFirst({
    where: { key, status: "active", publishedRevision: { not: null } },
  });
  if (!head?.publishedRevision) return null;
  const revision = await prisma.notificationDefinitionRevision.findUnique({
    where: { definitionId_revision: { definitionId: head.id, revision: head.publishedRevision } },
  });
  if (!revision) return null;
  return {
    id: head.id,
    key: revision.key,
    revision: revision.revision,
    label: revision.label,
    description: revision.description,
    titleTemplate: revision.titleTemplate,
    bodyTemplate: revision.bodyTemplate,
    hrefTemplate: revision.hrefTemplate,
    responseMode: responseMode(revision.responseMode),
    isImportant: revision.isImportant,
    allowProjectMonitoring: revision.allowProjectMonitoring,
    variableKeys: parseStringArray(revision.variableKeysJson),
    allowUserApi: revision.allowUserApi,
    allowedOpenApiClientIds: parseNumberArray(revision.allowedOpenApiClientIdsJson),
  };
}

export function canSourceUseDefinition(
  source: NotificationPublicationSource,
  definition: Pick<PublishedDefinition, "allowUserApi" | "allowedOpenApiClientIds">,
): DomainValidationResult<true> {
  if (source.kind === "internal") return okCommand(true);
  if (source.kind === "user-api") {
    return definition.allowUserApi
      ? okCommand(true)
      : failCommand("该通知定义不允许个人 API 发布", 403, "definitionKey");
  }
  const clientId = Number(source.id);
  return Number.isInteger(clientId) && definition.allowedOpenApiClientIds.includes(clientId)
    ? okCommand(true)
    : failCommand("该通知定义未授权给当前 Open API Client", 403, "definitionKey");
}

async function saveExistingDefinition(
  userId: number,
  definitionId: number,
  expectedVersion: number,
  prepared: PreparedNotificationDefinition,
): Promise<ServiceResult<NotificationDefinitionDto>> {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.notificationDefinition.findUnique({ where: { id: definitionId } });
      if (!current) return serviceError("通知定义不存在", 404);
      if (current.status !== "active") return serviceError("已归档通知定义不能修改", 409);
      if (current.version !== expectedVersion) return serviceError("通知定义已被其他人修改，请刷新后重试", 409);
      const stableKey = validateImmutableNotificationDefinitionKey(current.key, prepared.key);
      if (!stableKey.ok) {
        return serviceError(stableKey.issue.message, stableKey.issue.status, fieldDetails(stableKey.issue.field));
      }
      const nextRevision = current.revision + 1;
      const occurredAt = new Date();
      const updated = await tx.notificationDefinition.updateMany({
        where: { id: definitionId, status: "active", version: expectedVersion, revision: current.revision },
        data: {
          ...definitionDraftData(prepared),
          revision: nextRevision,
          version: { increment: 1 },
          updatedByUserId: userId,
        },
      });
      if (updated.count !== 1) return serviceError("通知定义已被其他人修改，请刷新后重试", 409);
      await tx.notificationDefinitionRevision.create({
        data: definitionRevisionData(definitionId, nextRevision, userId, prepared),
      });
      await appendLifecycleEvent(tx, {
        definitionId,
        revision: nextRevision,
        action: "saved",
        actorUserId: userId,
        occurredAt,
        priorVersion: current.version,
      });
      return serviceOk(toDefinitionDto(await requireDefinition(tx, definitionId)));
    });
  } catch (error) {
    return isUniqueConstraintError(error)
      ? serviceError("通知定义 key 已存在", 409)
      : definitionStorageError("保存通知定义失败", error);
  }
}

function definitionCreateData(userId: number, prepared: PreparedNotificationDefinition) {
  return {
    ...definitionDraftData(prepared),
    status: "active",
    revision: 1,
    version: 1,
    createdByUserId: userId,
    updatedByUserId: userId,
  };
}

function definitionDraftData(prepared: PreparedNotificationDefinition) {
  return {
    key: prepared.key,
    label: prepared.label,
    description: prepared.description,
    titleTemplate: prepared.titleTemplate,
    bodyTemplate: prepared.bodyTemplate,
    hrefTemplate: prepared.hrefTemplate,
    responseMode: prepared.responseMode,
    isImportant: prepared.isImportant,
    allowProjectMonitoring: prepared.allowProjectMonitoring,
    variableKeysJson: JSON.stringify(prepared.variableKeys),
    allowUserApi: prepared.allowUserApi,
    allowedOpenApiClientIdsJson: JSON.stringify(prepared.allowedOpenApiClientIds),
  };
}

function definitionRevisionData(
  definitionId: number,
  revision: number,
  userId: number,
  prepared: PreparedNotificationDefinition,
) {
  return {
    definitionId,
    revision,
    ...definitionDraftData(prepared),
    contentFingerprint: prepared.contentFingerprint,
    createdByUserId: userId,
  };
}

async function appendLifecycleEvent(
  tx: Prisma.TransactionClient,
  input: {
    definitionId: number;
    revision: number;
    action: NotificationDefinitionLifecycleAction;
    actorUserId: number;
    occurredAt: Date;
    priorVersion: number;
  },
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "NotificationDefinitionLifecycleEvent" (
      "id", "definitionId", "revision", "action", "actorUserId", "occurredAt",
      "priorVersion", "newVersion"
    ) VALUES (
      ${randomUUID()}, ${input.definitionId}, ${input.revision}, ${input.action},
      ${input.actorUserId}, ${input.occurredAt}, ${input.priorVersion},
      ${input.priorVersion + 1}
    )
  `);
}

async function requireDefinition(tx: Prisma.TransactionClient, definitionId: number) {
  const saved = await tx.notificationDefinition.findUnique({ where: { id: definitionId } });
  if (!saved) throw new Error(`Notification definition ${definitionId} disappeared inside its lifecycle transaction`);
  return saved;
}

function fieldDetails(field: string | undefined) {
  return field ? { field } : undefined;
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}

function definitionStorageError(message: string, error: unknown) {
  console.error(message, error);
  return serviceError(message, 500);
}
