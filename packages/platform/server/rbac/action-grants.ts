import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import {
  PERMISSION_ACTION_KEYS,
  isLegacyPermissionActionKey,
  isPermissionActionKey,
  actionImplies,
  roleKeyToActionKey,
  type PermissionActionKey,
} from "@workspace/platform/permission-actions";
import {
  canPermissionActionInheritFromAncestor,
  canPermissionResourceInheritGlobalScope,
  isPermissionActionSupported,
} from "@workspace/platform/permission-resource-policy";
import { prisma } from "@workspace/platform/server/prisma";
import { isRootAdminUser } from "../auth/root";
import { evaluatePermission } from "./check";
import { getUserDepartmentIds, getUserPositionIds } from "./helpers";
import { getResourceAncestors } from "./resource";
import { getGrants, setGrant, type SubjectType } from "./grants";

export interface ActionGrantItem {
  subjectId: number;
  resourceKey: string;
  actionKey: PermissionActionKey;
  resourceId: number;
  scopeId: string | null;
}

export interface EvaluatePermissionActionOptions {
  scopeId?: string | null;
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
  opts?: { scopeId?: string | null; actorUserId?: number; storage?: "legacyCompat" | "action" },
) {
  if (value && !isPermissionActionSupported(resourceKey, actionKey)) {
    throw new Error("该资源尚未接入该权限动作");
  }
  if (opts?.storage !== "action" && isLegacyPermissionActionKey(actionKey)) {
    await setGrant(subjectType, subjectId, resourceKey, actionKey, value, opts);
    return;
  }
  if (!isResourceEnabled(resourceKey)) {
    throw new Error("模块未启用，不能配置该资源权限");
  }
  if (subjectType === "user" && await isRootAdminUser(subjectId)) {
    throw new Error("内置 admin 账号不参与 RBAC 授权");
  }

  const resource = await prisma.resource.findUnique({ where: { key: resourceKey } });
  if (!resource) throw new Error(`Invalid resourceKey(${resourceKey})`);

  const scopeId = opts?.scopeId ?? null;
  if (subjectType === "user") {
    if (value) {
      const existing = await prisma.userResourceActionGrant.findFirst({
        where: { userId: subjectId, resourceId: resource.id, actionKey, scopeId },
      });
      if (!existing) await prisma.userResourceActionGrant.create({ data: { userId: subjectId, resourceId: resource.id, actionKey, scopeId } });
    } else {
      await prisma.userResourceActionGrant.deleteMany({ where: { userId: subjectId, resourceId: resource.id, actionKey, scopeId } });
    }
  } else if (subjectType === "position") {
    if (value) {
      const existing = await prisma.positionResourceActionGrant.findFirst({
        where: { positionId: subjectId, resourceId: resource.id, actionKey, scopeId },
      });
      if (!existing) await prisma.positionResourceActionGrant.create({ data: { positionId: subjectId, resourceId: resource.id, actionKey, scopeId } });
    } else {
      await prisma.positionResourceActionGrant.deleteMany({ where: { positionId: subjectId, resourceId: resource.id, actionKey, scopeId } });
    }
  } else if (value) {
    const existing = await prisma.departmentResourceActionGrant.findFirst({
      where: { departmentId: subjectId, resourceId: resource.id, actionKey, scopeId },
    });
    if (!existing) await prisma.departmentResourceActionGrant.create({ data: { departmentId: subjectId, resourceId: resource.id, actionKey, scopeId } });
  } else {
    await prisma.departmentResourceActionGrant.deleteMany({ where: { departmentId: subjectId, resourceId: resource.id, actionKey, scopeId } });
  }
}

export async function evaluatePermissionAction(
  userId: number,
  resourceKey: string,
  actionKey: PermissionActionKey,
  opts?: EvaluatePermissionActionOptions,
) {
  if (await isRootAdminUser(userId)) return true;
  if (!isResourceEnabled(resourceKey)) return false;
  if (!isPermissionActionSupported(resourceKey, actionKey)) return false;
  if (opts?.scopeId === undefined && isLegacyPermissionActionKey(actionKey) && await evaluatePermission(userId, resourceKey, actionKey)) return true;

  if (opts?.scopeId === undefined) {
    if (await evaluatePermission(userId, resourceKey, "admin")) return true;
    if (actionKey === "create" && await evaluatePermission(userId, resourceKey, "write")) return true;
    if (actionKey === "access" && await evaluatePermission(userId, resourceKey, "access")) return true;
  }

  const resource = await prisma.resource.findUnique({ where: { key: resourceKey }, select: { id: true } });
  if (!resource) return false;
  const resourceIds = await getResourceAncestors(resource.id);
  const inheritableResourceIds = canPermissionActionInheritFromAncestor(resourceKey, actionKey)
    ? resourceIds
    : [resource.id];
  const [positionIds, departmentIds] = await Promise.all([
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
  ]);
  const matchingActionKeys = PERMISSION_ACTION_KEYS.filter((grantedActionKey) =>
    actionImplies(grantedActionKey, actionKey),
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

  function legacyGrantMatchesScope(grant: { scopeId: string | null }) {
    if (opts?.scopeId === undefined) return true;
    if (grant.scopeId === opts.scopeId) return true;
    return grant.scopeId === null && opts.scopeId !== null && scopedResourceIncludesGlobal;
  }

  function legacyGrantMatches(grant: { resourceId: number; roleKey: string; scopeId: string | null }) {
    if (!legacyGrantMatchesScope(grant)) return false;
    if (!inheritableResourceIds.includes(grant.resourceId)) return false;
    const grantedActionKey = roleKeyToActionKey(grant.roleKey);
    return Boolean(grantedActionKey && actionImplies(grantedActionKey, actionKey));
  }

  if (opts?.scopeId !== undefined) {
    const [userLegacyGrants, positionLegacyGrantGroups, departmentLegacyGrantGroups] = await Promise.all([
      getGrants("user", userId, opts.scopeId),
      Promise.all(positionIds.map((positionId) => getGrants("position", positionId, opts.scopeId))),
      Promise.all(departmentIds.map((departmentId) => getGrants("department", departmentId, opts.scopeId))),
    ]);
    const hasLegacyAction = [
      ...userLegacyGrants,
      ...positionLegacyGrantGroups.flat(),
      ...departmentLegacyGrantGroups.flat(),
    ].some(legacyGrantMatches);
    if (hasLegacyAction) return true;
  }

  const [userGrant, positionGrant, departmentGrant] = await Promise.all([
    prisma.userResourceActionGrant.findFirst({
      where: { userId, resourceId: { in: inheritableResourceIds }, actionKey: { in: matchingActionKeys }, ...scopeWhere },
    }),
    positionIds.length ? prisma.positionResourceActionGrant.findFirst({
      where: { positionId: { in: positionIds }, resourceId: { in: inheritableResourceIds }, actionKey: { in: matchingActionKeys }, ...scopeWhere },
    }) : null,
    departmentIds.length ? prisma.departmentResourceActionGrant.findFirst({
      where: { departmentId: { in: departmentIds }, resourceId: { in: inheritableResourceIds }, actionKey: { in: matchingActionKeys }, ...scopeWhere },
    }) : null,
  ]);
  return Boolean(userGrant || positionGrant || departmentGrant);
}
