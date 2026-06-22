import type { PermissionContext } from "./types";
import { prisma } from "@workspace/platform/server/prisma";
import { RESOURCE_KEYS } from "../../resources";
import { isResourceEnabled } from "../../effective-module-registry";

const DEFAULT_ACCESS_ROOT_KEYS = ["settings.account", "work", "docs"];
let activeResourceIdsCache: Set<number> | null = null;
let defaultAccessRootIdsCache: Set<number> | null = null;

async function getActiveResourceIds() {
  if (activeResourceIdsCache) return activeResourceIdsCache;
  const activeKeys = RESOURCE_KEYS.filter((key) => isResourceEnabled(key));
  const rows = await prisma.resource.findMany({
    where: { key: { in: activeKeys } },
    select: { id: true },
  });
  activeResourceIdsCache = new Set(rows.map((row) => row.id));
  return activeResourceIdsCache;
}

async function getDefaultAccessRootIds() {
  if (defaultAccessRootIdsCache) return defaultAccessRootIdsCache;
  const activeKeys = DEFAULT_ACCESS_ROOT_KEYS.filter((key) => isResourceEnabled(key));
  const rows = await prisma.resource.findMany({
    where: { key: { in: activeKeys } },
    select: { id: true },
  });
  defaultAccessRootIdsCache = new Set(rows.map((row) => row.id));
  return defaultAccessRootIdsCache;
}

function grantsContainAdmin(
  grants: Map<number, Set<string>> | undefined,
  activeResourceIds: Set<number>,
) {
  if (!grants) return false;
  for (const [resourceId, roles] of grants.entries()) {
    if (!activeResourceIds.has(resourceId)) continue;
    if (roles.has("admin")) return true;
  }
  return false;
}

export async function hasImplicitAccessGrant({
  roleKey,
  resourceIds,
  isCapability,
}: {
  roleKey: string;
  resourceIds: number[];
  isCapability: boolean;
}) {
  if (roleKey !== "access" || isCapability) return false;
  const rootIds = await getDefaultAccessRootIds();
  return resourceIds.some((resourceId) => rootIds.has(resourceId));
}

export async function hasAnyAdminGrantForContext(ctx: PermissionContext) {
  if (ctx.isAdmin) return true;
  const activeResourceIds = await getActiveResourceIds();
  if (ctx._grantCache) {
    return grantsContainAdmin(ctx._grantCache.userGrants, activeResourceIds)
      || grantsContainAdmin(ctx._grantCache.positionGrants, activeResourceIds)
      || grantsContainAdmin(ctx._grantCache.departmentGrants, activeResourceIds);
  }
  const activeIds = [...activeResourceIds];
  if (activeIds.length === 0) return false;
  const [direct, position, department] = await Promise.all([
    prisma.userResourceRole.findFirst({
      where: {
        userId: ctx.userId,
        resourceId: { in: activeIds },
        role: { key: "admin" },
      },
      select: { id: true },
    }),
    ctx.positionIds.length > 0
      ? prisma.positionResourceRole.findFirst({
          where: {
            positionId: { in: ctx.positionIds },
            resourceId: { in: activeIds },
            role: { key: "admin" },
          },
          select: { id: true },
        })
      : null,
    ctx.departmentIds.length > 0
      ? prisma.departmentResourceRole.findFirst({
          where: {
            departmentId: { in: ctx.departmentIds },
            resourceId: { in: activeIds },
            role: { key: "admin" },
          },
          select: { id: true },
        })
      : null,
  ]);
  return Boolean(direct || position || department);
}
