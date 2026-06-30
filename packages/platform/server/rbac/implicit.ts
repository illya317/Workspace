import type { PermissionContext } from "./types";
import { prisma } from "@workspace/platform/server/prisma";
import { RESOURCE_KEYS } from "../../resources";
import { isResourceEnabled } from "../../effective-module-registry";

const DEFAULT_RESOURCE_ROLES = {
  "settings.account": "access",
  "work.tasks": "delete",
  docs: "access",
  "docs.editor": "access",
} as const;
const DEFAULT_ACCESS_RESOURCE_KEYS = Object.keys(DEFAULT_RESOURCE_ROLES);
const DEFAULT_ROLE_LEVEL: Record<string, number> = { access: 0, write: 1, delete: 2 };
let activeResourceIdsCache: Set<number> | null = null;
const defaultResourceIdsByRoleCache = new Map<string, Set<number>>();

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

async function getDefaultResourceIdsForRole(roleKey: string) {
  if (defaultResourceIdsByRoleCache.has(roleKey)) return defaultResourceIdsByRoleCache.get(roleKey)!;
  const roleLevel = DEFAULT_ROLE_LEVEL[roleKey];
  if (roleLevel === undefined) return new Set<number>();
  const activeKeys = DEFAULT_ACCESS_RESOURCE_KEYS.filter((key) =>
    isResourceEnabled(key) && DEFAULT_ROLE_LEVEL[DEFAULT_RESOURCE_ROLES[key as keyof typeof DEFAULT_RESOURCE_ROLES]] >= roleLevel
  );
  const rows = await prisma.resource.findMany({
    where: { key: { in: activeKeys } },
    select: { id: true },
  });
  const ids = new Set(rows.map((row) => row.id));
  defaultResourceIdsByRoleCache.set(roleKey, ids);
  return ids;
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
  if (isCapability) return false;
  const defaultIds = await getDefaultResourceIdsForRole(roleKey);
  return defaultIds.has(resourceIds[0]);
}

export function isDefaultAccessResource(resourceKey: string | undefined | null) {
  return Boolean(resourceKey && DEFAULT_ACCESS_RESOURCE_KEYS.includes(resourceKey));
}

export function getDefaultResourceRole(resourceKey: string | undefined | null) {
  if (!resourceKey) return null;
  return DEFAULT_RESOURCE_ROLES[resourceKey as keyof typeof DEFAULT_RESOURCE_ROLES] ?? null;
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
