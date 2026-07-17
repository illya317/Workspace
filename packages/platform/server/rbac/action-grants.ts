import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import {
  PERMISSION_ACTION_KEYS,
  isPermissionActionKey,
  type PermissionActionKey,
} from "@workspace/platform/permission-actions";
import {
  isPermissionActionGrantable,
  permissionGrantContributesToAction,
} from "@workspace/platform/permission-action-grantability";
import {
  canPermissionActionInheritFromAncestor,
  canPermissionResourceInheritGlobalScope,
  isPermissionActionSupported,
} from "@workspace/platform/permission-resource-policy";
import { isRegisteredSpaceResourceKey } from "@workspace/platform/space-registry";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { getCapabilityOwnerKey, getResourceDef } from "@workspace/platform/resources";
import { isRootAdminUsername, isRootAdminUser } from "../auth/root";
import { getUserDepartmentIds, getUserPositionIds } from "./helpers";
import { defaultResourceActionAllows } from "./implicit";
import { hasImplicitAdminForResourceIds, hasImplicitGrantForResourceIds } from "./implicit-admins";
import { hasGlobalGrantManagementAccess, hasResourceAdminAccess } from "./admin-scope";
import { recordPermissionGrantLedgerEvent } from "./permission-grant-ledger";
import { getProjectedAncestorResourceIds, type PermissionResourceProjectionKind } from "./resource-projection";

export type SubjectType = "user" | "position" | "department";

export interface ActionGrantItem {
  subjectId: number;
  resourceKey: string;
  actionKey: PermissionActionKey;
  resourceId: number;
  scopeId: string | null;
}

export interface EvaluatePermissionActionOptions {
  scopeId?: string | null;
  projection?: PermissionResourceProjectionKind;
  client?: Prisma.TransactionClient | typeof prisma;
}

export interface PermissionGrantMutationResult {
  changed: boolean;
  eventId?: number;
}

export interface SubjectPermissionActionGrantChange {
  subjectType: SubjectType;
  subjectId: number;
  resourceKey: string;
  actionKey: PermissionActionKey;
  value: boolean;
  scopeId?: string | null;
}

export interface PermissionGrantMutationOptions {
  actorUserId?: number;
  source?: string;
  reason?: string | null;
  batchId?: string | null;
  metadata?: Record<string, unknown> | null;
  authorizationResourceKeys?: readonly string[];
  beforeMutation?: (tx: Prisma.TransactionClient) => Promise<void>;
}

export class PermissionGrantMutationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PermissionGrantMutationError";
    this.status = status;
  }
}

export async function getActionGrants(
  subjectType: SubjectType,
  subjectId?: number,
  scopeId?: string | null,
): Promise<ActionGrantItem[]> {
  type ActionGrantRow = {
    userId?: number;
    positionId?: number;
    departmentId?: number;
    resourceId: number;
    actionKey: string;
    scopeId: string | null;
    resource: { key: string };
  };

  const include = { resource: { select: { key: true } } };
  function buildWhere(base: Record<string, unknown>) {
    const where: Record<string, unknown> = { ...base };
    if (subjectId !== undefined) {
      where[subjectType === "user" ? "userId" : subjectType === "position" ? "positionId" : "departmentId"] = subjectId;
    }
    if (scopeId !== undefined) {
      where.OR = scopeId === null ? [{ scopeId: null }] : [{ scopeId: null }, { scopeId }];
    }
    return where;
  }

  let rows: ActionGrantRow[] = [];
  if (subjectType === "user") {
    rows = await prisma.userResourceActionGrant.findMany({
      where: buildWhere(subjectId !== undefined ? { userId: subjectId } : {}),
      include,
    });
  } else if (subjectType === "position") {
    rows = await prisma.positionResourceActionGrant.findMany({
      where: buildWhere(subjectId !== undefined ? { positionId: subjectId } : {}),
      include,
    });
  } else {
    rows = await prisma.departmentResourceActionGrant.findMany({
      where: buildWhere(subjectId !== undefined ? { departmentId: subjectId } : {}),
      include,
    });
  }

  return rows
    .filter((row) => isResourceEnabled(row.resource.key) && isPermissionActionKey(row.actionKey))
    .map((row) => ({
      subjectId: subjectType === "user" ? row.userId! : subjectType === "position" ? row.positionId! : row.departmentId!,
      resourceKey: row.resource.key,
      actionKey: row.actionKey as PermissionActionKey,
      resourceId: row.resourceId,
      scopeId: row.scopeId,
    }));
}

export async function setSubjectPermissionActionGrant(
  subjectType: SubjectType,
  subjectId: number,
  resourceKey: string,
  actionKey: PermissionActionKey,
  value: boolean,
  opts?: PermissionGrantMutationOptions & { scopeId?: string | null },
): Promise<PermissionGrantMutationResult> {
  const [result] = await setSubjectPermissionActionGrants([{
    subjectType,
    subjectId,
    resourceKey,
    actionKey,
    value,
    scopeId: opts?.scopeId,
  }], opts);
  return result ?? { changed: false };
}

type GrantResource = { id: number; key: string; name: string };

function validateGrantChange(change: SubjectPermissionActionGrantChange) {
  if (!Number.isInteger(change.subjectId) || change.subjectId <= 0) {
    throw new PermissionGrantMutationError("授权主体无效");
  }
  if (change.value && !isPermissionActionSupported(change.resourceKey, change.actionKey)) {
    throw new PermissionGrantMutationError("该资源尚未接入该权限动作");
  }
  if (change.value && !isPermissionActionGrantable(change.resourceKey, change.actionKey)) {
    throw new PermissionGrantMutationError("空间入口资源仅支持访问权限");
  }
  if (!isResourceEnabled(change.resourceKey)) {
    throw new PermissionGrantMutationError("模块未启用，不能配置该资源权限");
  }
}

async function assertGrantSubjectsExist(
  changes: readonly SubjectPermissionActionGrantChange[],
  client: Prisma.TransactionClient,
) {
  const userIds = [...new Set(changes.filter((change) => change.subjectType === "user").map((change) => change.subjectId))];
  const positionIds = [...new Set(changes.filter((change) => change.subjectType === "position").map((change) => change.subjectId))];
  const departmentIds = [...new Set(changes.filter((change) => change.subjectType === "department").map((change) => change.subjectId))];
  const [users, positions, departments] = await Promise.all([
    userIds.length ? client.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, canLogin: true },
    }) : [],
    positionIds.length ? client.position.findMany({ where: { id: { in: positionIds } }, select: { id: true } }) : [],
    departmentIds.length ? client.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true } }) : [],
  ]);
  const found = {
    user: new Set(users.map((row) => row.id)),
    position: new Set(positions.map((row) => row.id)),
    department: new Set(departments.map((row) => row.id)),
  };
  if (changes.some((change) => !found[change.subjectType].has(change.subjectId))) {
    throw new PermissionGrantMutationError("授权主体不存在");
  }
  if (users.some((user) => user.canLogin && isRootAdminUsername(user.username))) {
    throw new PermissionGrantMutationError("内置 admin 账号不参与 RBAC 授权");
  }
}

async function mutateGrant(
  tx: Prisma.TransactionClient,
  change: SubjectPermissionActionGrantChange,
  resource: GrantResource,
) {
  const { subjectType, subjectId, actionKey, value } = change;
  const scopeId = change.scopeId ?? null;
  if (subjectType === "user") {
    if (!value) {
      const deleted = await tx.userResourceActionGrant.deleteMany({ where: { userId: subjectId, resourceId: resource.id, actionKey, scopeId } });
      return deleted.count > 0;
    }
    const existing = await tx.userResourceActionGrant.findFirst({ where: { userId: subjectId, resourceId: resource.id, actionKey, scopeId } });
    if (existing) return false;
    await tx.userResourceActionGrant.create({ data: { userId: subjectId, resourceId: resource.id, actionKey, scopeId } });
    return true;
  }
  if (subjectType === "position") {
    if (!value) {
      const deleted = await tx.positionResourceActionGrant.deleteMany({ where: { positionId: subjectId, resourceId: resource.id, actionKey, scopeId } });
      return deleted.count > 0;
    }
    const existing = await tx.positionResourceActionGrant.findFirst({ where: { positionId: subjectId, resourceId: resource.id, actionKey, scopeId } });
    if (existing) return false;
    await tx.positionResourceActionGrant.create({ data: { positionId: subjectId, resourceId: resource.id, actionKey, scopeId } });
    return true;
  }
  if (!value) {
    const deleted = await tx.departmentResourceActionGrant.deleteMany({ where: { departmentId: subjectId, resourceId: resource.id, actionKey, scopeId } });
    return deleted.count > 0;
  }
  const existing = await tx.departmentResourceActionGrant.findFirst({ where: { departmentId: subjectId, resourceId: resource.id, actionKey, scopeId } });
  if (existing) return false;
  await tx.departmentResourceActionGrant.create({ data: { departmentId: subjectId, resourceId: resource.id, actionKey, scopeId } });
  return true;
}

function grantMutationTupleLockKey(change: SubjectPermissionActionGrantChange) {
  return [
    "permission-action-grant-tuple-v1",
    change.subjectType,
    change.subjectId,
    change.resourceKey,
    change.actionKey,
    change.scopeId ?? "<global>",
  ].join(":");
}

function authorizationDomainResourceKeys(resourceKeys: readonly string[]) {
  const result = new Set<string>();
  const expanded = new Set<string>();
  function addResource(resourceKey: string) {
    if (expanded.has(resourceKey)) return;
    expanded.add(resourceKey);
    let current: string | null = resourceKey;
    while (current) {
      result.add(current);
      const ownerKey = getCapabilityOwnerKey(current);
      if (ownerKey) addResource(ownerKey);
      current = getResourceDef(current)?.parentKey ?? null;
    }
  }
  resourceKeys.forEach(addResource);
  return [...result].sort();
}

async function acquireGrantMutationLocks(
  tx: Prisma.TransactionClient,
  changes: readonly SubjectPermissionActionGrantChange[],
  authorizationResourceKeys: readonly string[],
) {
  const domainResourceKeys = authorizationDomainResourceKeys([
    ...changes.map((change) => change.resourceKey),
    ...authorizationResourceKeys,
  ]);
  for (const resourceKey of domainResourceKeys) {
    const lockKey = `permission-action-grant-domain-v1:${resourceKey}`;
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS lock_result`,
    );
  }
  const tupleLockKeys = [...new Set(changes.map(grantMutationTupleLockKey))].sort();
  for (const lockKey of tupleLockKeys) {
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS lock_result`,
    );
  }
}

export async function setSubjectPermissionActionGrants(
  changes: readonly SubjectPermissionActionGrantChange[],
  opts: PermissionGrantMutationOptions = {},
): Promise<PermissionGrantMutationResult[]> {
  if (changes.length === 0) return [];
  changes.forEach(validateGrantChange);
  const resourceKeys = [...new Set(changes.map((change) => change.resourceKey))];

  return prisma.$transaction(async (tx) => {
    await acquireGrantMutationLocks(tx, changes, opts.authorizationResourceKeys ?? []);
    await assertGrantSubjectsExist(changes, tx);
    const resources = await tx.resource.findMany({
      where: { key: { in: resourceKeys } },
      select: { id: true, key: true, name: true },
    });
    const resourceByKey = new Map(resources.map((resource) => [resource.key, resource]));
    for (const resourceKey of resourceKeys) {
      if (!resourceByKey.has(resourceKey)) throw new PermissionGrantMutationError(`Invalid resourceKey(${resourceKey})`);
    }
    await opts.beforeMutation?.(tx);
    const preparedChanges = changes.map((change) => ({
      change,
      resource: resourceByKey.get(change.resourceKey)!,
    }));
    const results: PermissionGrantMutationResult[] = [];
    for (const { change, resource } of preparedChanges) {
      const changed = await mutateGrant(tx, change, resource);
      if (!changed) {
        results.push({ changed: false });
        continue;
      }
      const event = await recordPermissionGrantLedgerEvent({
        eventType: change.value ? "grant" : "revoke",
        actorUserId: opts.actorUserId ?? null,
        subjectType: change.subjectType,
        subjectId: change.subjectId,
        resourceId: resource.id,
        resourceKey: resource.key,
        resourceName: resource.name,
        actionKey: change.actionKey,
        scopeId: change.scopeId ?? null,
        beforeValue: !change.value,
        afterValue: change.value,
        source: opts.source ?? (opts.actorUserId ? "permission_request" : "system"),
        reason: opts.reason,
        batchId: opts.batchId,
        metadata: opts.metadata,
      }, tx);
      results.push({ changed: true, eventId: event.id });
    }
    return results;
  });
}

export async function evaluatePermissionAction(
  userId: number,
  resourceKey: string,
  actionKey: PermissionActionKey,
  opts?: EvaluatePermissionActionOptions,
) {
  const client = opts?.client ?? prisma;
  if (await isRootAdminUser(userId, client)) return true;
  if (!isResourceEnabled(resourceKey)) return false;
  if (!isPermissionActionSupported(resourceKey, actionKey)) return false;
  if (isRegisteredSpaceResourceKey(resourceKey) && actionKey !== "entry") return false;
  if (resourceKey === "settings.admin" && actionKey === "entry") {
    return await hasGlobalGrantManagementAccess(userId, client) || await hasResourceAdminAccess(userId, client);
  }
  const capabilityOwnerKey = getCapabilityOwnerKey(resourceKey);
  if (capabilityOwnerKey) {
    if (!isResourceEnabled(capabilityOwnerKey)) return false;
    if (!(await evaluatePermissionAction(userId, capabilityOwnerKey, "entry", { ...opts, client }))) return false;
  }

  const resourceIds = await getProjectedAncestorResourceIds(resourceKey, opts?.projection ?? "default", client);
  const resourceId = resourceIds[0];
  if (!resourceId) return false;
  if (actionKey !== "grant" && await hasImplicitAdminForResourceIds(userId, resourceIds, client)) return true;
  if (actionKey === "grant" && await hasImplicitGrantForResourceIds(userId, resourceIds, client)) return true;
  if (!capabilityOwnerKey && defaultResourceActionAllows(resourceKey, actionKey)) return true;
  const inheritableResourceIds = canPermissionActionInheritFromAncestor(resourceKey, actionKey)
    ? resourceIds
    : [resourceId];
  const [positionIds, departmentIds] = await Promise.all([
    getUserPositionIds(userId, client),
    getUserDepartmentIds(userId, client),
  ]);
  const matchingActionKeys = isRegisteredSpaceResourceKey(resourceKey) && actionKey === "entry"
    ? [...PERMISSION_ACTION_KEYS]
    : PERMISSION_ACTION_KEYS.filter((grantedActionKey) =>
        permissionGrantContributesToAction(resourceKey, grantedActionKey, actionKey),
      );
  const scopedResourceIncludesGlobal = opts?.scopeId !== undefined && opts.scopeId !== null
    ? canPermissionResourceInheritGlobalScope(resourceKey)
    : false;
  const scopeWhere = opts?.scopeId === undefined
    ? {}
    : opts.scopeId === null
      ? { scopeId: null }
      : scopedResourceIncludesGlobal
        ? { OR: [{ scopeId: null }, { scopeId: opts.scopeId }] }
        : { scopeId: opts.scopeId };

  const [userGrant, positionGrant, departmentGrant] = await Promise.all([
    client.userResourceActionGrant.findFirst({
      where: { userId, resourceId: { in: inheritableResourceIds }, actionKey: { in: matchingActionKeys }, ...scopeWhere },
    }),
    positionIds.length ? client.positionResourceActionGrant.findFirst({
      where: { positionId: { in: positionIds }, resourceId: { in: inheritableResourceIds }, actionKey: { in: matchingActionKeys }, ...scopeWhere },
    }) : null,
    departmentIds.length ? client.departmentResourceActionGrant.findFirst({
      where: { departmentId: { in: departmentIds }, resourceId: { in: inheritableResourceIds }, actionKey: { in: matchingActionKeys }, ...scopeWhere },
    }) : null,
  ]);
  return Boolean(userGrant || positionGrant || departmentGrant);
}
