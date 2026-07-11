import type { PermissionContext } from "./types";
import type { PermissionActionKey } from "@workspace/platform/permission-actions";
import { prisma } from "@workspace/platform/server/prisma";
import { RESOURCE_KEYS } from "../../resources";
import { isResourceEnabled } from "../../effective-module-registry";

export {
  IMPLICIT_ALL_ADMIN_EMPLOYEE_IDS,
} from "./implicit-admins";

const DEFAULT_RESOURCE_ACTIONS = {
  "settings.account": "read",
  docs: "read",
} as const satisfies Record<string, PermissionActionKey>;
const DEFAULT_ACCESS_RESOURCE_KEYS = Object.keys(DEFAULT_RESOURCE_ACTIONS);
let activeResourceIdsCache: Set<number> | null = null;
const defaultResourceIdsByActionCache = new Map<PermissionActionKey, Set<number>>();

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

async function getDefaultResourceIdsForAction(actionKey: PermissionActionKey) {
  if (defaultResourceIdsByActionCache.has(actionKey)) return defaultResourceIdsByActionCache.get(actionKey)!;
  const activeKeys = DEFAULT_ACCESS_RESOURCE_KEYS.filter((key) =>
    isResourceEnabled(key) && DEFAULT_RESOURCE_ACTIONS[key as keyof typeof DEFAULT_RESOURCE_ACTIONS] === actionKey
  );
  const rows = await prisma.resource.findMany({
    where: { key: { in: activeKeys } },
    select: { id: true },
  });
  const ids = new Set(rows.map((row) => row.id));
  defaultResourceIdsByActionCache.set(actionKey, ids);
  return ids;
}

function grantsContainConfigureAction(
  grants: Map<number, Set<string>> | undefined,
  activeResourceIds: Set<number>,
) {
  if (!grants) return false;
  for (const [resourceId, roles] of grants.entries()) {
    if (!activeResourceIds.has(resourceId)) continue;
    if (roles.has("configure")) return true;
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
  if (roleKey !== "read") return false;
  const defaultIds = await getDefaultResourceIdsForAction(roleKey);
  return defaultIds.has(resourceIds[0]);
}

export function isDefaultAccessResource(resourceKey: string | undefined | null) {
  return Boolean(resourceKey && DEFAULT_ACCESS_RESOURCE_KEYS.includes(resourceKey));
}

export function getDefaultResourceAction(resourceKey: string | undefined | null) {
  if (!resourceKey) return null;
  return DEFAULT_RESOURCE_ACTIONS[resourceKey as keyof typeof DEFAULT_RESOURCE_ACTIONS] ?? null;
}

export async function hasAnyAdminGrantForContext(ctx: PermissionContext) {
  if (ctx.isAdmin || ctx.isAllResourceAdmin) return true;
  const activeResourceIds = await getActiveResourceIds();
  if ((ctx.implicitAdminResourceIds ?? []).some((resourceId) => activeResourceIds.has(resourceId))) return true;
  if (ctx._grantCache) {
    return grantsContainConfigureAction(ctx._grantCache.userGrants, activeResourceIds)
      || grantsContainConfigureAction(ctx._grantCache.positionGrants, activeResourceIds)
      || grantsContainConfigureAction(ctx._grantCache.departmentGrants, activeResourceIds);
  }
  const activeIds = [...activeResourceIds];
  if (activeIds.length === 0) return false;
  const [direct, position, department] = await Promise.all([
    prisma.userResourceActionGrant.findFirst({
      where: {
        userId: ctx.userId,
        resourceId: { in: activeIds },
        actionKey: "configure",
      },
      select: { id: true },
    }),
    ctx.positionIds.length > 0
      ? prisma.positionResourceActionGrant.findFirst({
          where: {
            positionId: { in: ctx.positionIds },
            resourceId: { in: activeIds },
            actionKey: "configure",
          },
          select: { id: true },
        })
      : null,
    ctx.departmentIds.length > 0
      ? prisma.departmentResourceActionGrant.findFirst({
          where: {
            departmentId: { in: ctx.departmentIds },
            resourceId: { in: activeIds },
            actionKey: "configure",
          },
          select: { id: true },
        })
      : null,
  ]);
  return Boolean(direct || position || department);
}
