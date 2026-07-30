import "server-only";
import { z } from "zod";
import { validateNotificationDeliveryChannelsForActivation } from "@workspace/platform/server/notification-delivery-outbox";
import { prisma } from "@workspace/platform/server/prisma";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { canManageProject, canViewProject } from "./access";
import {
  canonicalJson,
  prepareProjectNotificationCondition,
  type ProjectNotificationCondition,
} from "./domain/project-notification-condition";
import {
  projectNotificationEventTypeSchema,
  projectNotificationRuleEditableSchema,
  projectNotificationRuleUpdateSchema,
  type ProjectNotificationRuleEditable,
} from "./domain/project-notification-rule-validation";
import { validateProjectNotificationWriteInput } from "./domain/project-notification-write-validation";
import {
  parseProjectNotificationAudiencePolicy,
  parseProjectNotificationChannelPolicy,
  parseStoredProjectNotificationAudiencePolicy,
  parseStoredProjectNotificationChannelPolicy,
  type ProjectNotificationAudiencePolicy,
  type ProjectNotificationChannelPolicy,
  resolveProjectNotificationAudience,
} from "./project-notification-audience";
import {
  projectNotificationAudienceCapacity,
  projectNotificationAudienceCapacityMessage,
} from "./project-notification-audience-capacity";
import { getProjectNotificationQueueHealth } from "./project-notification-queue-health";
import {
  findCompatibleDefinition,
  listCompatibleDefinitions,
} from "./project-notification-definition-catalog";
import {
  commitProjectNotificationRuleArchive,
  commitProjectNotificationRulePublish,
} from "./project-notification-rule-lifecycle";
import {
  PROJECT_NOTIFICATION_SIGNAL_KINDS,
  type ProjectNotificationSignalKind,
} from "./project-notification-signal-contract";

export const PROJECT_NOTIFICATION_EVENT_TYPES = PROJECT_NOTIFICATION_SIGNAL_KINDS;

export type ProjectNotificationEventType = (typeof PROJECT_NOTIFICATION_EVENT_TYPES)[number];
export { PROJECT_NOTIFICATION_SIGNAL_KINDS };
export type { ProjectNotificationSignalKind };

export {
  findCompatibleDefinition,
  listCompatibleDefinitions,
  PROJECT_NOTIFICATION_VARIABLE_KEYS,
  projectNotificationPublicationSource,
} from "./project-notification-definition-catalog";
export {
  projectNotificationEvaluationQuerySchema,
  projectNotificationEventTypeSchema,
  projectNotificationRuleCreateSchema,
  projectNotificationRuleEditableSchema,
  projectNotificationRuleUpdateSchema,
  projectNotificationRuleVersionSchema,
} from "./domain/project-notification-rule-validation";
export type { ProjectNotificationRuleEditable } from "./domain/project-notification-rule-validation";
const exactNotificationGrantOptions = {
  grantMatch: { action: "exact" as const, resource: "exact" as const },
};

export type ProjectNotificationRuleDto = {
  id: number; projectId: number; key: string; label: string; definitionKey: string;
  eventType: ProjectNotificationEventType;
  condition: ProjectNotificationCondition;
  audiencePolicy: ProjectNotificationAudiencePolicy;
  channelPolicy: ProjectNotificationChannelPolicy;
  cooldownSeconds: number; status: "draft" | "published" | "archived";
  revision: number; publishedRevision: number | null; version: number;
  createdByUserId: number; updatedByUserId: number;
  publishedByUserId: number | null; archivedByUserId: number | null;
  createdAt: string; updatedAt: string; publishedAt: string | null; archivedAt: string | null;
};

type ProjectNotificationRuleRow = {
  id: number; projectId: number; key: string; label: string; definitionKey: string; eventType: string;
  conditionJson: string; audiencePolicyJson: string; channelPolicyJson: string;
  cooldownSeconds: number; status: string; revision: number; publishedRevision: number | null;
  version: number; createdByUserId: number; updatedByUserId: number;
  publishedByUserId: number | null; archivedByUserId: number | null;
  createdAt: Date; updatedAt: Date; publishedAt: Date | null; archivedAt: Date | null;
};

export async function listProjectNotificationRules(input: { userId: number; projectId: number }) {
  const access = await getProjectNotificationAccess(input.userId, input.projectId);
  if (!access.ok) return access.result;
  if (!access.canRead) return serviceError("无权限查看项目通知规则", 403);

  const [rows, definitions, queueHealth] = await Promise.all([
    prisma.projectNotificationRule.findMany({
      where: { projectId: input.projectId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
    }),
    listCompatibleDefinitions(input.projectId),
    getProjectNotificationQueueHealth({
      projectId: input.projectId,
      includeFailureDetails: access.canAudit,
    }),
  ]);
  const rules = rows.map(toProjectNotificationRuleDto);
  const invalid = rules.find((rule) => !rule.ok);
  if (invalid && !invalid.ok) return serviceError(invalid.error, 500);
  return serviceOk({
    projectId: input.projectId,
    rules: rules.flatMap((rule) => rule.ok ? [rule.data] : []),
    availableDefinitions: definitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      revision: definition.revision,
      variableKeys: definition.variableKeys,
    })),
    queueHealth,
    permissions: {
      canConfigure: !access.isArchived && access.canManage && access.canConfigure,
      canAudit: access.canRead && access.canAudit,
    },
  });
}

export async function createProjectNotificationRule(input: {
  userId: number;
  projectId: number;
  body: unknown;
}) {
  validateProjectNotificationWriteInput(input);
  const parsed = projectNotificationRuleEditableSchema.safeParse(input.body);
  if (!parsed.success) return serviceError(parsed.error.issues[0]?.message ?? "项目通知规则无效", 400);
  const access = await getProjectNotificationAccess(input.userId, input.projectId);
  if (!access.ok) return access.result;
  if (access.isArchived) return serviceError("归档项目不能新建通知规则", 409);
  if (!access.canManage || !access.canConfigure) return serviceError("无权限配置项目通知规则", 403);
  if (!(await findCompatibleDefinition(input.projectId, parsed.data.definitionKey))) {
    return serviceError("通知定义不存在、未发布或包含项目监管无法提供的变量", 409);
  }
  const prepared = prepareEditableRule(parsed.data);
  if (!prepared.ok) return serviceError(prepared.error, 400);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const rule = await tx.projectNotificationRule.create({
        data: {
          projectId: input.projectId,
          ...prepared.data.head,
          status: "draft",
          revision: 1,
          version: 1,
          createdByUserId: input.userId,
          updatedByUserId: input.userId,
        },
      });
      await tx.projectNotificationRuleRevision.create({
        data: {
          ruleId: rule.id,
          revision: 1,
          ...prepared.data.revision,
          createdByUserId: input.userId,
        },
      });
      return rule;
    });
    const dto = toProjectNotificationRuleDto(created);
    return dto.ok ? serviceOk({ rule: dto.data }) : serviceError(dto.error, 500);
  } catch (error) {
    return isUniqueConstraintError(error)
      ? serviceError("该项目下的通知规则 key 已存在", 409)
      : serviceError("保存项目通知规则失败", 500);
  }
}

export async function updateProjectNotificationRule(input: {
  userId: number;
  projectId: number;
  ruleId: number;
  body: unknown;
}) {
  validateProjectNotificationWriteInput(input);
  const parsed = projectNotificationRuleUpdateSchema.safeParse(input.body);
  if (!parsed.success) return serviceError(parsed.error.issues[0]?.message ?? "项目通知规则无效", 400);
  const access = await getProjectNotificationAccess(input.userId, input.projectId);
  if (!access.ok) return access.result;
  if (access.isArchived) return serviceError("归档项目不能修改通知规则", 409);
  if (!access.canManage || !access.canConfigure) return serviceError("无权限配置项目通知规则", 403);
  const current = await prisma.projectNotificationRule.findFirst({
    where: { id: input.ruleId, projectId: input.projectId },
  });
  if (!current) return serviceError("项目通知规则不存在", 404);
  if (current.status === "archived") return serviceError("已归档规则不能修改", 409);
  if (current.version !== parsed.data.version) return serviceError("规则已被其他人修改，请刷新后重试", 409);
  if (current.key !== parsed.data.key) {
    return serviceError("通知规则创建后不能修改 key", 409);
  }
  if (!(await findCompatibleDefinition(input.projectId, parsed.data.definitionKey))) {
    return serviceError("通知定义不存在、未发布或包含项目监管无法提供的变量", 409);
  }
  const prepared = prepareEditableRule(parsed.data);
  if (!prepared.ok) return serviceError(prepared.error, 400);
  const nextRevision = current.revision + 1;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.projectNotificationRule.updateMany({
        where: {
          id: current.id,
          projectId: input.projectId,
          status: { not: "archived" },
          revision: current.revision,
          version: parsed.data.version,
        },
        data: {
          ...prepared.data.head,
          revision: nextRevision,
          version: { increment: 1 },
          updatedByUserId: input.userId,
        },
      });
      if (changed.count !== 1) return null;
      await tx.projectNotificationRuleRevision.create({
        data: {
          ruleId: current.id,
          revision: nextRevision,
          ...prepared.data.revision,
          createdByUserId: input.userId,
        },
      });
      return tx.projectNotificationRule.findUnique({ where: { id: current.id } });
    });
    if (!updated) return serviceError("规则已被其他人修改，请刷新后重试", 409);
    const dto = toProjectNotificationRuleDto(updated);
    return dto.ok ? serviceOk({ rule: dto.data }) : serviceError(dto.error, 500);
  } catch (error) {
    return isUniqueConstraintError(error)
      ? serviceError("该项目下的通知规则 key 已存在", 409)
      : serviceError("保存项目通知规则失败", 500);
  }
}

export async function publishProjectNotificationRule(input: {
  userId: number;
  projectId: number;
  ruleId: number;
  version: number;
}) {
  const access = await getProjectNotificationAccess(input.userId, input.projectId);
  if (!access.ok) return access.result;
  if (access.isArchived) return serviceError("归档项目不能发布通知规则", 409);
  if (!access.canManage || !access.canConfigure) return serviceError("无权限发布项目通知规则", 403);
  const current = await prisma.projectNotificationRule.findFirst({
    where: { id: input.ruleId, projectId: input.projectId },
  });
  if (!current) return serviceError("项目通知规则不存在", 404);
  if (current.status === "archived") return serviceError("已归档规则不能发布", 409);
  if (current.version !== input.version) return serviceError("规则已被其他人修改，请刷新后重试", 409);
  if (current.publishedRevision === current.revision) return serviceError("当前修订已经发布", 409);
  if (!(await findCompatibleDefinition(input.projectId, current.definitionKey))) {
    return serviceError("通知定义不存在、未发布或包含项目监管无法提供的变量", 409);
  }
  const channelPolicy = parseStoredProjectNotificationChannelPolicy(current.channelPolicyJson);
  const audiencePolicy = parseStoredProjectNotificationAudiencePolicy(current.audiencePolicyJson);
  if (!channelPolicy.ok || !audiencePolicy.ok) {
    return serviceError("项目通知规则受众或渠道配置无效", 500);
  }
  const channelActivation = await validateNotificationDeliveryChannelsForActivation(
    channelPolicy.data.channels,
  );
  if (!channelActivation.ok) {
    return serviceError(
      channelActivation.issue.message,
      channelActivation.issue.status ?? 409,
      channelActivation.issue.field ? { field: channelActivation.issue.field } : undefined,
    );
  }
  if (!(await findCompatibleDefinition(input.projectId, current.definitionKey))) {
    return serviceError("通知定义在规则发布前已变化，请刷新后重试", 409);
  }
  const now = new Date();
  const audienceUsernames = await resolveProjectNotificationAudience({
    projectId: input.projectId,
    policy: audiencePolicy.data,
    asOf: now,
  });
  const audienceCapacity = projectNotificationAudienceCapacity(audienceUsernames.length);
  if (audienceCapacity.exceeded) {
    return serviceError(
      projectNotificationAudienceCapacityMessage(audienceCapacity.count),
      409,
      {
        field: "audiencePolicy",
        audienceCount: audienceCapacity.count,
        audienceMaxCount: audienceCapacity.maxCount,
      },
    );
  }
  const saved = await commitProjectNotificationRulePublish({
    ruleId: current.id,
    projectId: input.projectId,
    revision: current.revision,
    expectedVersion: input.version,
    actorUserId: input.userId,
    occurredAt: now,
  });
  if (saved.outcome === "capacity-exceeded") {
    return serviceError(saved.error.message, saved.error.status, saved.error.details);
  }
  if (saved.outcome === "conflict") {
    return serviceError("规则已被其他人修改，请刷新后重试", 409);
  }
  const dto = toProjectNotificationRuleDto(saved.rule);
  return dto.ok ? serviceOk({ rule: dto.data }) : serviceError(dto.error, 500);
}

export async function archiveProjectNotificationRule(input: {
  userId: number;
  projectId: number;
  ruleId: number;
  version: number;
}) {
  validateProjectNotificationWriteInput(input);
  const access = await getProjectNotificationAccess(input.userId, input.projectId);
  if (!access.ok) return access.result;
  if (!access.canManage || !access.canConfigure) return serviceError("无权限归档项目通知规则", 403);
  const now = new Date();
  const saved = await commitProjectNotificationRuleArchive({
    ruleId: input.ruleId,
    projectId: input.projectId,
    expectedVersion: input.version,
    actorUserId: input.userId,
    occurredAt: now,
  });
  if (!saved) {
    const existing = await prisma.projectNotificationRule.findFirst({
      where: { id: input.ruleId, projectId: input.projectId },
      select: { id: true },
    });
    return existing
      ? serviceError("规则已被其他人修改或已经归档", 409)
      : serviceError("项目通知规则不存在", 404);
  }
  const dto = toProjectNotificationRuleDto(saved);
  return dto.ok ? serviceOk({ rule: dto.data }) : serviceError(dto.error, 500);
}

export async function listProjectNotificationEvaluations(input: {
  userId: number;
  projectId: number;
  ruleId: number;
  page: number;
  pageSize: number;
}) {
  const access = await getProjectNotificationAccess(input.userId, input.projectId);
  if (!access.ok) return access.result;
  if (!access.canRead || !access.canAudit) return serviceError("无权限查看项目通知评估账本", 403);
  const rule = await prisma.projectNotificationRule.findFirst({
    where: { id: input.ruleId, projectId: input.projectId },
    select: { id: true },
  });
  if (!rule) return serviceError("项目通知规则不存在", 404);
  const [items, total] = await Promise.all([
    prisma.projectNotificationEvaluation.findMany({
      where: { ruleId: input.ruleId, projectId: input.projectId },
      orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.projectNotificationEvaluation.count({
      where: { ruleId: input.ruleId, projectId: input.projectId },
    }),
  ]);
  return serviceOk({
    items: items.map((item) => ({
      ...item,
      evaluatedAt: item.evaluatedAt.toISOString(),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  });
}

function prepareEditableRule(input: ProjectNotificationRuleEditable):
  | {
      ok: true;
      data: {
        head: {
          key: string;
          label: string;
          definitionKey: string;
          eventType: ProjectNotificationEventType;
          conditionJson: string;
          audiencePolicyJson: string;
          channelPolicyJson: string;
          cooldownSeconds: number;
        };
        revision: {
          key: string;
          label: string;
          definitionKey: string;
          eventType: ProjectNotificationEventType;
          conditionJson: string;
          conditionFingerprint: string;
          audiencePolicyJson: string;
          channelPolicyJson: string;
          cooldownSeconds: number;
        };
      };
    }
  | { ok: false; error: string } {
  const condition = prepareProjectNotificationCondition(input.condition);
  if (!condition.ok) return condition;
  const audience = parseProjectNotificationAudiencePolicy(input.audiencePolicy);
  if (!audience.ok) return audience;
  const channels = parseProjectNotificationChannelPolicy(input.channelPolicy);
  if (!channels.ok) return channels;
  const common = {
    key: input.key,
    label: input.label,
    definitionKey: input.definitionKey,
    eventType: input.eventType,
    conditionJson: condition.data.canonicalJson,
    audiencePolicyJson: canonicalJson(audience.data),
    channelPolicyJson: canonicalJson(channels.data),
    cooldownSeconds: input.cooldownSeconds,
  };
  return {
    ok: true,
    data: {
      head: common,
      revision: { ...common, conditionFingerprint: condition.data.fingerprint },
    },
  };
}

async function getProjectNotificationAccess(userId: number, projectId: number) {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return { ok: false as const, result: serviceError("项目 ID 无效", 400) };
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, isArchived: true },
  });
  if (!project) return { ok: false as const, result: serviceError("项目不存在", 404) };
  const [canView, canManage, canRead, canConfigure, canAudit] = await Promise.all([
    canViewProject(userId, projectId),
    canManageProject(userId, projectId),
    evaluatePermissionAction(userId, "settings.notifications", "read", exactNotificationGrantOptions),
    evaluatePermissionAction(userId, "settings.notifications", "configure", exactNotificationGrantOptions),
    evaluatePermissionAction(userId, "settings.notifications", "audit", exactNotificationGrantOptions),
  ]);
  return {
    ok: true as const,
    isArchived: project.isArchived,
    canView,
    canManage,
    canRead: canView && canRead,
    canConfigure,
    canAudit,
  };
}

function toProjectNotificationRuleDto(row: ProjectNotificationRuleRow):
  | { ok: true; data: ProjectNotificationRuleDto }
  | { ok: false; error: string } {
  const eventType = projectNotificationEventTypeSchema.safeParse(row.eventType);
  const condition = prepareProjectNotificationCondition(parseJson(row.conditionJson));
  const audience = parseProjectNotificationAudiencePolicy(parseJson(row.audiencePolicyJson));
  const channels = parseProjectNotificationChannelPolicy(parseJson(row.channelPolicyJson));
  const status = z.enum(["draft", "published", "archived"]).safeParse(row.status);
  if (!eventType.success || !condition.ok || !audience.ok || !channels.ok || !status.success) {
    return { ok: false, error: `项目通知规则 ${row.id} 的持久化配置无效` };
  }
  return {
    ok: true,
    data: {
      id: row.id,
      projectId: row.projectId,
      key: row.key,
      label: row.label,
      definitionKey: row.definitionKey,
      eventType: eventType.data,
      condition: condition.data.condition,
      audiencePolicy: audience.data,
      channelPolicy: channels.data,
      cooldownSeconds: row.cooldownSeconds,
      status: status.data,
      revision: row.revision,
      publishedRevision: row.publishedRevision,
      version: row.version,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      publishedByUserId: row.publishedByUserId,
      archivedByUserId: row.archivedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
    },
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}
