import type { PermissionActionKey } from "@workspace/platform/permission-actions";
import { prisma, type Prisma } from "@workspace/platform/server/prisma";

export type PermissionGrantLedgerSubjectType = "user" | "position" | "department";
export type PermissionGrantLedgerEventType = "grant" | "revoke" | "baseline";

type LedgerClient = Pick<
  Prisma.TransactionClient,
  | "permissionGrantLedgerEvent"
  | "user"
  | "employee"
  | "position"
  | "department"
  | "userResourceActionGrant"
  | "positionResourceActionGrant"
  | "departmentResourceActionGrant"
>;

export interface PermissionGrantLedgerEventInput {
  eventType: PermissionGrantLedgerEventType;
  actorUserId?: number | null;
  subjectType: PermissionGrantLedgerSubjectType;
  subjectId: number;
  resourceId: number;
  resourceKey: string;
  resourceName?: string | null;
  actionKey: PermissionActionKey;
  scopeId?: string | null;
  beforeValue: boolean;
  afterValue: boolean;
  source?: string;
  reason?: string | null;
  batchId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PermissionGrantLedgerQuery {
  isSystemAdmin: boolean;
  manageableResourceKeys: Iterable<string>;
  page?: number;
  pageSize?: number;
  query?: string;
  eventType?: PermissionGrantLedgerEventType | "all";
  subjectType?: PermissionGrantLedgerSubjectType | "all";
  resourceKey?: string;
  actionKey?: string;
  scopeId?: string;
}

type Snapshot = {
  label: string;
  data: Record<string, unknown>;
};

function nullableJson(value: Record<string, unknown> | null | undefined) {
  return value ? JSON.stringify(value) : null;
}

function normalizePage(input?: number) {
  return Number.isInteger(input) && input !== undefined && input >= 0 ? input : 0;
}

function normalizePageSize(input?: number) {
  if (!Number.isInteger(input) || input === undefined) return 50;
  return Math.min(Math.max(input, 20), 100);
}

async function userSnapshot(client: LedgerClient, userId: number): Promise<Snapshot | null> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      employees: { select: { employeeId: true, name: true }, take: 1 },
    },
  });
  if (!user) return null;
  const employee = user.employees[0] ?? null;
  const label = employee?.name || user.username || `用户#${user.id}`;
  return {
    label,
    data: {
      id: user.id,
      username: user.username,
      employeeId: employee?.employeeId ?? null,
      name: employee?.name ?? null,
    },
  };
}

async function subjectSnapshot(
  client: LedgerClient,
  subjectType: PermissionGrantLedgerSubjectType,
  subjectId: number,
): Promise<Snapshot | null> {
  if (subjectType === "user") return userSnapshot(client, subjectId);
  if (subjectType === "position") {
    const position = await client.position.findUnique({
      where: { id: subjectId },
      select: { id: true, code: true, name: true },
    });
    return position ? { label: position.name, data: position } : null;
  }
  const department = await client.department.findUnique({
    where: { id: subjectId },
    select: { id: true, code: true, name: true },
  });
  return department ? { label: department.name, data: department } : null;
}

export async function recordPermissionGrantLedgerEvent(
  input: PermissionGrantLedgerEventInput,
  client: LedgerClient = prisma as unknown as LedgerClient,
) {
  const [actor, subject] = await Promise.all([
    input.actorUserId ? userSnapshot(client, input.actorUserId) : Promise.resolve(null),
    subjectSnapshot(client, input.subjectType, input.subjectId),
  ]);

  return client.permissionGrantLedgerEvent.create({
    data: {
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      actorLabel: actor?.label ?? null,
      actorSnapshotJson: nullableJson(actor?.data),
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      subjectLabel: subject?.label ?? null,
      subjectSnapshotJson: nullableJson(subject?.data),
      resourceId: input.resourceId,
      resourceKey: input.resourceKey,
      resourceName: input.resourceName ?? null,
      actionKey: input.actionKey,
      scopeId: input.scopeId ?? null,
      beforeValue: input.beforeValue,
      afterValue: input.afterValue,
      source: input.source ?? "permission_request",
      reason: input.reason ?? null,
      batchId: input.batchId ?? null,
      metadataJson: nullableJson(input.metadata),
    },
  });
}

export async function listPermissionGrantLedgerEvents(input: PermissionGrantLedgerQuery) {
  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const manageableKeys = new Set(input.manageableResourceKeys);
  if (!input.isSystemAdmin && manageableKeys.size === 0) {
    return { events: [], page, pageSize, total: 0, totalPages: 1 };
  }

  const where: Prisma.PermissionGrantLedgerEventWhereInput = {};
  if (!input.isSystemAdmin) where.resourceKey = { in: [...manageableKeys] };
  if (input.eventType && input.eventType !== "all") where.eventType = input.eventType;
  if (input.subjectType && input.subjectType !== "all") where.subjectType = input.subjectType;
  if (input.resourceKey) where.resourceKey = input.resourceKey;
  if (input.actionKey) where.actionKey = input.actionKey;
  if (input.scopeId) where.scopeId = input.scopeId;

  const query = input.query?.trim();
  if (query) {
    where.OR = [
      { actorLabel: { contains: query, mode: "insensitive" } },
      { subjectLabel: { contains: query, mode: "insensitive" } },
      { resourceKey: { contains: query, mode: "insensitive" } },
      { resourceName: { contains: query, mode: "insensitive" } },
      { actionKey: { contains: query, mode: "insensitive" } },
      { scopeId: { contains: query, mode: "insensitive" } },
      { source: { contains: query, mode: "insensitive" } },
      { batchId: { contains: query, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.permissionGrantLedgerEvent.count({ where }),
    prisma.permissionGrantLedgerEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    events: rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      actorUserId: row.actorUserId,
      actorLabel: row.actorLabel,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      subjectLabel: row.subjectLabel,
      resourceKey: row.resourceKey,
      resourceName: row.resourceName,
      actionKey: row.actionKey,
      scopeId: row.scopeId,
      beforeValue: row.beforeValue,
      afterValue: row.afterValue,
      source: row.source,
      reason: row.reason,
      batchId: row.batchId,
      createdAt: row.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function hasLedgerForCurrentGrant(
  client: LedgerClient,
  grant: {
    subjectType: PermissionGrantLedgerSubjectType;
    subjectId: number;
    resourceKey: string;
    actionKey: string;
    scopeId: string | null;
  },
) {
  const existing = await client.permissionGrantLedgerEvent.findFirst({
    where: {
      subjectType: grant.subjectType,
      subjectId: grant.subjectId,
      resourceKey: grant.resourceKey,
      actionKey: grant.actionKey,
      scopeId: grant.scopeId,
      afterValue: true,
    },
    select: { id: true },
  });
  return Boolean(existing);
}

export async function backfillPermissionGrantLedgerBaselines(batchId = `permission-ledger-baseline-${Date.now()}`) {
  return prisma.$transaction(async (tx) => {
    const client = tx as unknown as LedgerClient;
    const [userGrants, positionGrants, departmentGrants] = await Promise.all([
      tx.userResourceActionGrant.findMany({ include: { resource: true } }),
      tx.positionResourceActionGrant.findMany({ include: { resource: true } }),
      tx.departmentResourceActionGrant.findMany({ include: { resource: true } }),
    ]);
    let created = 0;
    const grants = [
      ...userGrants.map((grant) => ({ subjectType: "user" as const, subjectId: grant.userId, grant })),
      ...positionGrants.map((grant) => ({ subjectType: "position" as const, subjectId: grant.positionId, grant })),
      ...departmentGrants.map((grant) => ({ subjectType: "department" as const, subjectId: grant.departmentId, grant })),
    ];

    for (const row of grants) {
      const current = {
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        resourceKey: row.grant.resource.key,
        actionKey: row.grant.actionKey,
        scopeId: row.grant.scopeId,
      };
      if (await hasLedgerForCurrentGrant(client, current)) continue;
      await recordPermissionGrantLedgerEvent({
        eventType: "baseline",
        actorUserId: null,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        resourceId: row.grant.resourceId,
        resourceKey: row.grant.resource.key,
        resourceName: row.grant.resource.name,
        actionKey: row.grant.actionKey as PermissionActionKey,
        scopeId: row.grant.scopeId,
        beforeValue: false,
        afterValue: true,
        source: "baseline_script",
        batchId,
      }, client);
      created += 1;
    }
    return { created, batchId };
  });
}
