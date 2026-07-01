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
    prisma.userResourceRole.findMany({
      where: { userId: ctx.userId },
      select: { resourceId: true, role: { select: { key: true } } },
    }),
    ctx.positionIds.length > 0
      ? prisma.positionResourceRole.findMany({
          where: { positionId: { in: ctx.positionIds } },
          select: { resourceId: true, role: { select: { key: true } } },
        })
      : [],
    ctx.departmentIds.length > 0
      ? prisma.departmentResourceRole.findMany({
          where: { departmentId: { in: ctx.departmentIds } },
          select: { resourceId: true, role: { select: { key: true } } },
        })
      : [],
  ]);

  const toMap = (rows: Array<{ resourceId: number; role: { key: string } }>) => {
    const m = new Map<number, Set<string>>();
    for (const r of rows) {
      if (!m.has(r.resourceId)) m.set(r.resourceId, new Set());
      m.get(r.resourceId)!.add(r.role.key);
    }
    return m;
  };

  ctx._grantCache = {
    userGrants: toMap(userRows),
    positionGrants: toMap(posRows),
    departmentGrants: toMap(deptRows),
  };
}
