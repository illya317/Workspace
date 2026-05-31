import { prisma } from "@/lib/prisma";
import { getUserPositionIds, getUserDepartmentIds } from "./helpers";
import { checkPermission } from "./check";

export interface PermissionContext {
  userId: number;
  isAdmin: boolean;
  positionIds: number[];
  departmentIds: number[];
  /** Preloaded grants for fast in-memory checks. Populated on demand. */
  _grantCache?: GrantCache;
}

interface GrantCache {
  /** resourceId → Set<roleKey> */
  userGrants: Map<number, Set<string>>;
  positionGrants: Map<number, Set<string>>;
  departmentGrants: Map<number, Set<string>>;
}

export async function getPermissionContext(userId: number): Promise<PermissionContext> {
  const [positionIds, departmentIds, isAdmin] = await Promise.all([
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
    checkPermission(userId, "system", "admin"),
  ]);
  return { userId, isAdmin, positionIds, departmentIds };
}

/** Preload all grants + warm resource/ancestor caches. Call once before batch visibility checks. */
export async function ensureGrantCache(ctx: PermissionContext): Promise<void> {
  if (ctx._grantCache) return;

  // Warm resource and ancestor caches (used by checkPermissionCached)
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
