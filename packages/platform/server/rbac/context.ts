import { prisma } from "@workspace/platform/server/prisma";
import { getUserPositionIds, getUserDepartmentIds } from "./helpers";
import { isRootAdminUser } from "../auth/root";
import { getImplicitAdminResourceIdsForUser, isImplicitAllResourceAdminUser } from "./implicit-admins";
import type { PermissionContext } from "./types";

export async function getPermissionContext(userId: number): Promise<PermissionContext> {
  const [positionIds, departmentIds, isAdmin, isAllResourceAdmin, implicitAdminResourceIds] = await Promise.all([
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
    isRootAdminUser(userId),
    isImplicitAllResourceAdminUser(userId),
    getImplicitAdminResourceIdsForUser(userId),
  ]);
  return { userId, isAdmin, isAllResourceAdmin, positionIds, departmentIds, implicitAdminResourceIds };
}

/** Preload all grants + warm resource/ancestor caches. Call once before batch visibility checks. */
export async function ensureGrantCache(ctx: PermissionContext): Promise<void> {
  if (ctx._grantCache) return;

  // Warm resource and ancestor caches for permission evaluation.
  const allResources = await prisma.resource.findMany({ select: { id: true, key: true, parentId: true } });
  const { _warmCaches } = await import("./check");
  _warmCaches(allResources);

  const [userRows, posRows, deptRows] = await Promise.all([
    prisma.userResourceActionGrant.findMany({
      where: { userId: ctx.userId },
      select: { resourceId: true, actionKey: true },
    }),
    ctx.positionIds.length > 0
      ? prisma.positionResourceActionGrant.findMany({
          where: { positionId: { in: ctx.positionIds } },
          select: { resourceId: true, actionKey: true },
        })
      : [],
    ctx.departmentIds.length > 0
      ? prisma.departmentResourceActionGrant.findMany({
          where: { departmentId: { in: ctx.departmentIds } },
          select: { resourceId: true, actionKey: true },
        })
      : [],
  ]);

  const toMap = (rows: Array<{ resourceId: number; actionKey: string }>) => {
    const m = new Map<number, Set<string>>();
    for (const r of rows) {
      if (!m.has(r.resourceId)) m.set(r.resourceId, new Set());
      m.get(r.resourceId)!.add(r.actionKey);
    }
    return m;
  };

  ctx._grantCache = {
    userGrants: toMap(userRows),
    positionGrants: toMap(posRows),
    departmentGrants: toMap(deptRows),
  };
}
