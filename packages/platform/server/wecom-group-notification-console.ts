import "server-only";

import { serviceError, serviceOk } from "../service-result";
import { prisma, Prisma } from "./prisma";
import { evaluatePermissionAction } from "./rbac/action-grants";
import {
  managedGroupStatusSchema,
  managedGroupVerificationStatusSchema,
  type NotificationGroupDataScope,
  type NotificationGroupSchedule,
  type NotificationManagedGroupStatus,
  type NotificationManagedGroupVerificationStatus,
} from "./wecom-group-notification-contract";

type GroupRow = {
  id: number;
  groupKey: string;
  displayName: string | null;
  status: string;
  ownerUserId: number | null;
  ownerUsername: string | null;
  ownerEmployeeName: string | null;
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

export async function listWecomGroupNotificationConsoleData(userId: number) {
  const [canRead, canConfigure, canAudit] = await Promise.all([
    notificationPermission(userId, "read"),
    notificationPermission(userId, "configure"),
    notificationPermission(userId, "audit"),
  ]);
  if (!canRead) return serviceError("无权限", 403);

  const [groups, policies, recentDeliveries, referenceOptions] = await Promise.all([
    listManagedGroups(),
    listGroupPolicies(),
    canAudit ? listRecentGroupDeliveries() : Promise.resolve([]),
    canConfigure ? listGroupReferenceOptions(userId) : Promise.resolve(null),
  ]);
  return serviceOk({
    managedGroups: groups,
    groupPolicies: policies,
    weeklyAgentOptions: [{
      key: "work.weekly-report",
      label: "周报 Agent",
      status: "available",
      triggerMode: "api",
      publicationRoute: "/api/modules/settings/notifications/group-publications",
      supportedScheduleModes: ["manual", "weekly"],
    }],
    recentDeliveries,
    ...(referenceOptions ?? { ownerUserOptions: [], ownerPositionOptions: [], definitionOptions: [], dataScopeOptions: { departments: [], projects: [], users: [] } }),
    canConfigure,
    canAudit,
  });
}

async function listGroupReferenceOptions(userId: number) {
  const [canReadHr, canReadProjects, departments, definitions] = await Promise.all([
    evaluatePermissionAction(userId, "hr.roster", "read"),
    evaluatePermissionAction(userId, "work.projects", "entry"),
    import("./user-preferences").then(({ listPreferredDepartmentOptions }) =>
      listPreferredDepartmentOptions(userId)
    ),
    import("./notification-publishing-storage").then(({ listPublishedNotificationDefinitionsForSource }) =>
      listPublishedNotificationDefinitionsForSource({
        kind: "internal",
        id: "notification-group-policy",
        label: "企业微信群发策略",
      })
    ),
  ]);
  const [users, positions, projects] = await Promise.all([
    prisma.user.findMany({
      where: canReadHr ? { canLogin: true } : { id: userId, canLogin: true },
      select: {
        id: true,
        username: true,
        employees: {
          select: { name: true, employeeId: true },
          orderBy: { id: "asc" },
          take: 1,
        },
      },
      orderBy: [{ username: "asc" }],
    }),
    canReadHr ? prisma.position.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, code: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    }) : Promise.resolve([]),
    canReadProjects ? prisma.project.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, code: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    }) : Promise.resolve([]),
  ]);
  const userOptions = users.map((user) => {
    const employee = user.employees[0];
    const employeeName = employee?.name.trim();
    return {
      id: user.id,
      label: employeeName || user.username,
      description: employeeName
        ? [employee?.employeeId, user.username].filter(Boolean).join(" · ")
        : undefined,
    };
  }).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  return {
    ownerUserOptions: userOptions,
    ownerPositionOptions: positions.map((position) => ({
      id: position.id,
      label: position.name,
      description: position.code || undefined,
    })),
    definitionOptions: definitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      revision: definition.revision,
    })),
    dataScopeOptions: {
      departments: departments.map((department) => ({
        id: String(department.id),
        label: department.name,
      })),
      projects: projects.map((project) => ({
        id: String(project.id),
        label: project.name,
      })),
      users: userOptions.map((user) => ({
        id: String(user.id),
        label: user.label,
      })),
    },
  };
}

async function listManagedGroups() {
  const rows = await prisma.$queryRaw<GroupRow[]>(Prisma.sql`
    SELECT
      group_row."id", group_row."groupKey", group_row."displayName", group_row."status",
      group_row."ownerUserId", owner_user."username" AS "ownerUsername",
      owner_employee."name" AS "ownerEmployeeName", group_row."ownerPositionId",
      owner_position."name" AS "ownerPositionName", group_row."verificationStatus",
      group_row."discoveredAt", group_row."lastSeenAt", group_row."lastVerifiedAt",
      group_row."version"
    FROM "NotificationManagedGroup" AS group_row
    LEFT JOIN "User" AS owner_user ON owner_user."id" = group_row."ownerUserId"
    LEFT JOIN LATERAL (
      SELECT employee."name"
      FROM "Employee" AS employee
      WHERE employee."userId" = owner_user."id"
      ORDER BY employee."id" ASC
      LIMIT 1
    ) AS owner_employee ON TRUE
    LEFT JOIN "Position" AS owner_position ON owner_position."id" = group_row."ownerPositionId"
    ORDER BY group_row."discoveredAt" DESC, group_row."id" DESC
  `);
  return rows.map((row) => ({
    id: row.id,
    groupKey: row.groupKey,
    displayName: row.displayName,
    status: groupStatus(row.status),
    ownerUser: row.ownerUserId ? {
      id: row.ownerUserId,
      username: row.ownerUsername,
      displayName: row.ownerEmployeeName?.trim() || row.ownerUsername,
    } : null,
    ownerPosition: row.ownerPositionId ? {
      id: row.ownerPositionId,
      name: row.ownerPositionName,
    } : null,
    discoveredAt: row.discoveredAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    verificationStatus: verificationStatus(row.verificationStatus),
    version: row.version,
  }));
}

async function listGroupPolicies() {
  const rows = await prisma.$queryRaw<PolicyRow[]>(Prisma.sql`
    SELECT
      policy."id", policy."key", policy."groupId", group_row."groupKey",
      group_row."displayName" AS "groupDisplayName", policy."definitionKey",
      policy."label", policy."dataScopeJson", policy."scheduleJson",
      policy."weeklyAgentKey", policy."enabled", policy."version", policy."updatedAt",
      latest_delivery."id" AS "lastDeliveryId",
      latest_delivery."status" AS "lastDeliveryStatus",
      latest_delivery."createdAt" AS "lastDeliveryAt",
      latest_failure."failedAt" AS "lastFailureAt",
      latest_failure."lastErrorCode" AS "lastFailureCode",
      latest_failure."lastErrorSummary" AS "lastFailureSummary"
    FROM "NotificationGroupPolicy" AS policy
    INNER JOIN "NotificationManagedGroup" AS group_row ON group_row."id" = policy."groupId"
    LEFT JOIN LATERAL (
      SELECT delivery."id", delivery."status", delivery."createdAt"
      FROM "NotificationPublication" AS publication
      INNER JOIN "NotificationDelivery" AS delivery ON delivery."publicationId" = publication."id"
      WHERE publication."sourceKind" = 'internal'
        AND publication."sourceId" = 'notification-group-policy:' || policy."id"
      ORDER BY delivery."createdAt" DESC, delivery."id" DESC
      LIMIT 1
    ) AS latest_delivery ON true
    LEFT JOIN LATERAL (
      SELECT delivery."failedAt", delivery."lastErrorCode", delivery."lastErrorSummary"
      FROM "NotificationPublication" AS publication
      INNER JOIN "NotificationDelivery" AS delivery ON delivery."publicationId" = publication."id"
      WHERE publication."sourceKind" = 'internal'
        AND publication."sourceId" = 'notification-group-policy:' || policy."id"
        AND delivery."status" = 'failed'
      ORDER BY delivery."failedAt" DESC NULLS LAST, delivery."id" DESC
      LIMIT 1
    ) AS latest_failure ON true
    ORDER BY policy."updatedAt" DESC, policy."id" DESC
  `);
  return rows.map(policyDto);
}

async function listRecentGroupDeliveries() {
  const rows = await prisma.$queryRaw<Array<{
    id: number;
    publicationId: string;
    policyId: string;
    groupKey: string;
    groupDisplayName: string | null;
    status: string;
    attemptCount: number;
    createdAt: Date;
    deliveredAt: Date | null;
    failedAt: Date | null;
    lastErrorCode: string | null;
    lastErrorSummary: string | null;
  }>>(Prisma.sql`
    SELECT
      delivery."id", delivery."publicationId",
      substring(publication."sourceId" from length('notification-group-policy:') + 1) AS "policyId",
      group_row."groupKey", group_row."displayName" AS "groupDisplayName",
      delivery."status", delivery."attemptCount", delivery."createdAt",
      delivery."deliveredAt", delivery."failedAt",
      delivery."lastErrorCode", delivery."lastErrorSummary"
    FROM "NotificationPublication" AS publication
    INNER JOIN "NotificationDelivery" AS delivery ON delivery."publicationId" = publication."id"
    INNER JOIN "NotificationGroupPolicy" AS policy
      ON publication."sourceId" = 'notification-group-policy:' || policy."id"
    INNER JOIN "NotificationManagedGroup" AS group_row ON group_row."id" = policy."groupId"
    WHERE publication."sourceKind" = 'internal'
    ORDER BY delivery."createdAt" DESC, delivery."id" DESC
    LIMIT 50
  `);
  return rows.map((row) => ({
    id: row.id,
    publicationId: row.publicationId,
    policyId: row.policyId,
    groupKey: row.groupKey,
    groupDisplayName: row.groupDisplayName,
    status: row.status,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    error: row.lastErrorCode ? {
      code: row.lastErrorCode,
      summary: sanitizeErrorSummary(row.lastErrorSummary),
    } : null,
  }));
}

function policyDto(row: PolicyRow) {
  return {
    id: row.id,
    key: row.key,
    groupId: row.groupId,
    groupKey: row.groupKey,
    groupDisplayName: row.groupDisplayName,
    definitionKey: row.definitionKey,
    label: row.label,
    dataScope: parseJson<NotificationGroupDataScope>(row.dataScopeJson, { type: "workspace", ids: [], label: "全 Workspace" }),
    schedule: parseJson<NotificationGroupSchedule>(row.scheduleJson, { mode: "manual" }),
    enabled: row.enabled,
    weeklyAgentBinding: row.weeklyAgentKey ? {
      agentKey: row.weeklyAgentKey,
      label: "周报 Agent",
      triggerMode: "api",
    } : null,
    lastDelivery: row.lastDeliveryId ? {
      id: row.lastDeliveryId,
      status: row.lastDeliveryStatus,
      createdAt: row.lastDeliveryAt?.toISOString() ?? null,
    } : null,
    lastFailure: row.lastFailureAt ? {
      failedAt: row.lastFailureAt.toISOString(),
      code: row.lastFailureCode,
      summary: sanitizeErrorSummary(row.lastFailureSummary),
    } : null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function notificationPermission(userId: number, action: "read" | "configure" | "audit") {
  return evaluatePermissionAction(userId, "settings.notifications", action, exactGrantOptions);
}

function groupStatus(value: string): NotificationManagedGroupStatus {
  return managedGroupStatusSchema.safeParse(value).success ? value as NotificationManagedGroupStatus : "suspended";
}

function verificationStatus(value: string): NotificationManagedGroupVerificationStatus {
  return managedGroupVerificationStatusSchema.safeParse(value).success ? value as NotificationManagedGroupVerificationStatus : "failed";
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function sanitizeErrorSummary(value: string | null) {
  if (!value) return null;
  return value
    .replace(/\b(authorization|token|secret|key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url-redacted]")
    .slice(0, 500);
}
