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
import { prisma } from "@workspace/platform/server/prisma";
import { getCapabilityOwnerKey } from "@workspace/platform/resources";
import { isRootAdminUser } from "../auth/root";
import { getUserDepartmentIds, getUserPositionIds } from "./helpers";
import { hasImplicitAccessGrant } from "./implicit";
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
}

export interface PermissionGrantMutationResult {
  changed: boolean;
  eventId?: number;
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
  opts?: {
    scopeId?: string | null;
    actorUserId?: number;
    source?: string;
    reason?: string | null;
    batchId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<PermissionGrantMutationResult> {
  if (value && !isPermissionActionSupported(resourceKey, actionKey)) {
    throw new Error("该资源尚未接入该权限动作");
  }
  if (value && !isPermissionActionGrantable(resourceKey, actionKey)) {
    throw new Error("空间入口资源仅支持访问权限");
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
  return prisma.$transaction(async (tx) => {
    let changed = false;
    if (subjectType === "user") {
      if (value) {
        const existing = await tx.userResourceActionGrant.findFirst({
          where: { userId: subjectId, resourceId: resource.id, actionKey, scopeId },
        });
        if (!existing) {
          await tx.userResourceActionGrant.create({ data: { userId: subjectId, resourceId: resource.id, actionKey, scopeId } });
          changed = true;
        }
      } else {
        const deleted = await tx.userResourceActionGrant.deleteMany({ where: { userId: subjectId, resourceId: resource.id, actionKey, scopeId } });
        changed = deleted.count > 0;
      }
    } else if (subjectType === "position") {
      if (value) {
        const existing = await tx.positionResourceActionGrant.findFirst({
          where: { positionId: subjectId, resourceId: resource.id, actionKey, scopeId },
        });
        if (!existing) {
          await tx.positionResourceActionGrant.create({ data: { positionId: subjectId, resourceId: resource.id, actionKey, scopeId } });
          changed = true;
        }
      } else {
        const deleted = await tx.positionResourceActionGrant.deleteMany({ where: { positionId: subjectId, resourceId: resource.id, actionKey, scopeId } });
        changed = deleted.count > 0;
      }
    } else if (value) {
      const existing = await tx.departmentResourceActionGrant.findFirst({
        where: { departmentId: subjectId, resourceId: resource.id, actionKey, scopeId },
      });
      if (!existing) {
        await tx.departmentResourceActionGrant.create({ data: { departmentId: subjectId, resourceId: resource.id, actionKey, scopeId } });
        changed = true;
      }
    } else {
      const deleted = await tx.departmentResourceActionGrant.deleteMany({ where: { departmentId: subjectId, resourceId: resource.id, actionKey, scopeId } });
      changed = deleted.count > 0;
    }

    if (!changed) return { changed: false };
    const event = await recordPermissionGrantLedgerEvent({
      eventType: value ? "grant" : "revoke",
      actorUserId: opts?.actorUserId ?? null,
      subjectType,
      subjectId,
      resourceId: resource.id,
      resourceKey: resource.key,
      resourceName: resource.name,
      actionKey,
      scopeId,
      beforeValue: !value,
      afterValue: value,
      source: opts?.source ?? (opts?.actorUserId ? "permission_request" : "system"),
      reason: opts?.reason,
      batchId: opts?.batchId,
      metadata: opts?.metadata,
    }, tx);
    return { changed: true, eventId: event.id };
  });
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
  if (isRegisteredSpaceResourceKey(resourceKey) && actionKey !== "entry") return false;
  if (resourceKey === "settings.admin" && actionKey === "entry") {
    return await hasGlobalGrantManagementAccess(userId) || await hasResourceAdminAccess(userId);
  }
  const capabilityOwnerKey = getCapabilityOwnerKey(resourceKey);
  if (capabilityOwnerKey) {
    if (!isResourceEnabled(capabilityOwnerKey)) return false;
    if (!(await evaluatePermissionAction(userId, capabilityOwnerKey, "entry"))) return false;
  }

  const resourceIds = await getProjectedAncestorResourceIds(resourceKey, opts?.projection ?? "default");
  const resourceId = resourceIds[0];
  if (!resourceId) return false;
  if (actionKey !== "grant" && await hasImplicitAdminForResourceIds(userId, resourceIds)) return true;
  if (actionKey === "grant" && await hasImplicitGrantForResourceIds(userId, resourceIds)) return true;
  if (await hasImplicitAccessGrant({
    roleKey: actionKey,
    resourceIds,
    isCapability: Boolean(capabilityOwnerKey),
  })) return true;
  const inheritableResourceIds = canPermissionActionInheritFromAncestor(resourceKey, actionKey)
    ? resourceIds
    : [resourceId];
  const [positionIds, departmentIds] = await Promise.all([
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
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
