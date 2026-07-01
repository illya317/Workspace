import { prisma } from "@workspace/platform/server/prisma";
import { normalizeRoleKey } from "@workspace/platform/permissions";
import { getUserPositionIds, getUserDepartmentIds } from "./helpers";
import { getResourceAncestors } from "./resource";
import { isRoleAllowedForResource } from "./maxRole";
import { isRootAdminUser } from "../auth/root";
import type { PermissionContext } from "./types";
import { getCapabilityOwnerKey, RESOURCE_KEYS } from "../../resources";
import { isResourceEnabled } from "../../effective-module-registry";
import {
  hasImplicitAccessGrant,
  hasAnyAdminGrantForContext,
} from "./implicit";
import { hasImplicitAdminForResourceIds } from "./implicit-admins";

function resolveRoleKeys(roleKey: string): string[] {
  const normalized = normalizeRoleKey(roleKey);
  // 权限层级：admin > delete > write > access
  // resolveRoleKeys(roleKey): 拥有哪些角色的用户，自动拥有 roleKey
  if (normalized === "admin") return ["admin"];                       // 只有 admin 才含 admin
  if (normalized === "delete") return ["admin", "delete"];            // admin 隐含 delete
  if (normalized === "write") return ["admin", "delete", "write"];    // admin/delete 隐含 write
  return ["admin", "delete", "write", "access"];                      // 所有角色都隐含 access
}

const ACTIVE_RESOURCE_KEYS = new Set(RESOURCE_KEYS);

export async function evaluatePermission(
  userId: number,
  resourceKey: string,
  roleKey: string,
): Promise<boolean> {
  if (await isRootAdminUser(userId)) return true;
  const normalized = normalizeRoleKey(roleKey);
  if (!ACTIVE_RESOURCE_KEYS.has(resourceKey) || !isResourceEnabled(resourceKey)) return false;

  // 1. Resolve resource
  const capabilityOwnerKey = getCapabilityOwnerKey(resourceKey);
  if (capabilityOwnerKey) {
    if (!isResourceEnabled(capabilityOwnerKey)) return false;
    if (!(await evaluatePermission(userId, capabilityOwnerKey, "access"))) return false;
  }

  // 2. Resolve resource
  const resource = await prisma.resource.findUnique({
    where: { key: resourceKey },
    select: { id: true },
  });
  if (!resource) return false;

  // 3. Check this resource AND all its ancestors (父资源覆盖子资源)
  const resourceIds = await getResourceAncestors(resource.id);
  const roleKeys = resolveRoleKeys(roleKey);
  // 3a. 运行时上限：即使有 grant，超过 maxRoleKey 也拒绝
  if (!(await isRoleAllowedForResource(resourceKey, normalized))) return false;
  if (await hasImplicitAdminForResourceIds(userId, resourceIds)) return true;

  if (await hasImplicitAccessGrant({
    roleKey: normalized,
    resourceIds,
    isCapability: Boolean(capabilityOwnerKey),
  })) return true;

  const userGrant = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resourceId: { in: resourceIds },
      role: { key: { in: roleKeys } },
    },
  });
  if (userGrant) return true;

  const posIds = await getUserPositionIds(userId);
  if (posIds.length > 0) {
    const positionGrant = await prisma.positionResourceRole.findFirst({
      where: {
        positionId: { in: posIds },
        resourceId: { in: resourceIds },
        role: { key: { in: roleKeys } },
      },
    });
    if (positionGrant) return true;
  }

  const deptIds = await getUserDepartmentIds(userId);
  if (deptIds.length > 0) {
    const deptGrant = await prisma.departmentResourceRole.findFirst({
      where: {
        departmentId: { in: deptIds },
        resourceId: { in: resourceIds },
        role: { key: { in: roleKeys } },
      },
    });
    if (deptGrant) return true;
  }

  if (resourceKey === "settings.admin" && normalized === "access") {
    return hasAnyAdminGrantForContext({
      userId,
      isAdmin: false,
      positionIds: posIds,
      departmentIds: deptIds,
    });
  }

  return false;
}

export async function evaluatePermissionWithContext(
  ctx: PermissionContext,
  resourceKey: string,
  roleKey: string,
): Promise<boolean> {
  if (ctx.isAdmin) return true;

  const normalized = normalizeRoleKey(roleKey);
  if (!ACTIVE_RESOURCE_KEYS.has(resourceKey) || !isResourceEnabled(resourceKey)) return false;
  const capabilityOwnerKey = getCapabilityOwnerKey(resourceKey);
  if (capabilityOwnerKey) {
    if (!isResourceEnabled(capabilityOwnerKey)) return false;
    if (!(await evaluatePermissionWithContext(ctx, capabilityOwnerKey, "access"))) return false;
  }
  if (!(await isRoleAllowedForResource(resourceKey, normalized))) return false;

  const resourceIds = await resolveResourceIds(resourceKey);
  if (!resourceIds) return false;
  if (hasImplicitAdminForContext(ctx, resourceIds)) return true;

  if (await hasImplicitAccessGrant({
    roleKey: normalized,
    resourceIds,
    isCapability: Boolean(capabilityOwnerKey),
  })) return true;
  if (resourceKey === "settings.admin" && normalized === "access" && await hasAnyAdminGrantForContext(ctx)) {
    return true;
  }

  // Fast path: use preloaded grant cache (avoids N×3 DB queries)
  if (ctx._grantCache) {
    return evaluatePermissionCached(ctx, resourceKey, roleKey);
  }

  // Slow path: individual DB queries
  return evaluatePermissionSlow(ctx, resourceKey, roleKey);
}

function hasImplicitAdminForContext(ctx: PermissionContext, resourceIds: number[]) {
  const implicitIds = ctx.implicitAdminResourceIds ?? [];
  if (implicitIds.length === 0) return false;
  const resourceIdSet = new Set(resourceIds);
  return implicitIds.some((resourceId) => resourceIdSet.has(resourceId));
}

const _resourceCache = new Map<string, { id: number } | null>();
const _ancestorCache = new Map<number, number[]>();

/** Warm caches for fast in-memory permission checks. Call once after ensureGrantCache. */
export function _warmCaches(resources: Array<{ id: number; key: string; parentId: number | null }>) {
  const byId = new Map(resources.map((r) => [r.id, r]));
  for (const r of resources) {
    _resourceCache.set(r.key, { id: r.id });
    // Build ancestor chain
    const chain: number[] = [];
    let cur: number = r.id;
    while (cur !== undefined && cur !== null) {
      chain.push(cur);
      const parent = byId.get(cur);
      cur = parent?.parentId ?? undefined!;
    }
    _ancestorCache.set(r.id, chain);
  }
}

async function resolveResourceIds(resourceKey: string): Promise<number[] | null> {
  if (!_resourceCache.has(resourceKey)) {
    _resourceCache.set(resourceKey, await prisma.resource.findUnique({
      where: { key: resourceKey }, select: { id: true },
    }));
  }
  const r = _resourceCache.get(resourceKey);
  if (!r) return null;
  if (!_ancestorCache.has(r.id)) {
    _ancestorCache.set(r.id, await getResourceAncestors(r.id));
  }
  return _ancestorCache.get(r.id)!;
}

function checkGrantCache(
  grants: Map<number, Set<string>> | undefined,
  resourceIds: number[],
  roleKeys: string[],
): boolean {
  if (!grants) return false;
  for (const rid of resourceIds) {
    const roles = grants.get(rid);
    if (roles && roleKeys.some((rk) => roles.has(rk))) return true;
  }
  return false;
}

function evaluatePermissionCached(
  ctx: PermissionContext,
  resourceKey: string,
  roleKey: string,
): boolean {
  const resourceIds = resolveResourceIdsSync(resourceKey);
  if (!resourceIds) return false;

  const roleKeys = resolveRoleKeys(roleKey);

  const cache = ctx._grantCache!;
  if (checkGrantCache(cache.userGrants, resourceIds, roleKeys)) return true;
  if (checkGrantCache(cache.positionGrants, resourceIds, roleKeys)) return true;
  if (checkGrantCache(cache.departmentGrants, resourceIds, roleKeys)) return true;
  return false;
}

function resolveResourceIdsSync(resourceKey: string): number[] | null {
  const r = _resourceCache.get(resourceKey);
  if (!r) return null;
  return _ancestorCache.get(r.id) ?? null;
}

async function evaluatePermissionSlow(
  ctx: PermissionContext,
  resourceKey: string,
  roleKey: string,
): Promise<boolean> {
  const resourceIds = await resolveResourceIds(resourceKey);
  if (!resourceIds) return false;

  const roleKeys = resolveRoleKeys(roleKey);

  const userGrant = await prisma.userResourceRole.findFirst({
    where: {
      userId: ctx.userId,
      resourceId: { in: resourceIds },
      role: { key: { in: roleKeys } },
    },
  });
  if (userGrant) return true;

  if (ctx.positionIds.length > 0) {
    const positionGrant = await prisma.positionResourceRole.findFirst({
      where: {
        positionId: { in: ctx.positionIds },
        resourceId: { in: resourceIds },
        role: { key: { in: roleKeys } },
      },
    });
    if (positionGrant) return true;
  }

  if (ctx.departmentIds.length > 0) {
    const deptGrant = await prisma.departmentResourceRole.findFirst({
      where: {
        departmentId: { in: ctx.departmentIds },
        resourceId: { in: resourceIds },
        role: { key: { in: roleKeys } },
      },
    });
    if (deptGrant) return true;
  }

  return false;
}
