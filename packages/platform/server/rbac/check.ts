import { isPermissionActionKey } from "@workspace/platform/permission-actions";
import { PERMISSION_ACTION_KEYS } from "@workspace/platform/permission-actions";
import {
  canPermissionActionInheritFromAncestor,
  isPermissionActionSupported,
} from "@workspace/platform/permission-resource-policy";
import { permissionGrantContributesToAction } from "@workspace/platform/permission-action-grantability";
import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { isRegisteredSpaceResourceKey } from "@workspace/platform/space-registry";
import { getCapabilityOwnerKey } from "@workspace/platform/resources";
import { prisma } from "@workspace/platform/server/prisma";
import { evaluatePermissionAction } from "./action-grants";
import { defaultResourceActionAllows } from "./implicit";
import type { PermissionContext } from "./types";

interface ResourceNode {
  id: number;
  key: string;
  parentId: number | null;
}

let resourceNodesCache: ResourceNode[] | null = null;

async function loadResourceNodes() {
  if (!resourceNodesCache) {
    resourceNodesCache = await prisma.resource.findMany({
      select: { id: true, key: true, parentId: true },
    });
  }
  return resourceNodesCache;
}

function getAncestorIds(resource: ResourceNode, byId: Map<number, ResourceNode>) {
  const ids: number[] = [];
  let current: ResourceNode | undefined = resource;
  while (current) {
    ids.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return ids;
}

function grantMapHasAction(
  grants: Map<number, Set<string>>,
  resourceIds: readonly number[],
  actionKeys: readonly string[],
) {
  for (const resourceId of resourceIds) {
    const actions = grants.get(resourceId);
    if (!actions) continue;
    for (const actionKey of actionKeys) {
      if (actions.has(actionKey)) return true;
    }
  }
  return false;
}

export async function evaluatePermission(
  userId: number,
  resourceKey: string,
  actionKey: string,
): Promise<boolean> {
  if (!isPermissionActionKey(actionKey)) return false;
  return evaluatePermissionAction(userId, resourceKey, actionKey);
}

export async function evaluatePermissionWithContext(
  ctx: PermissionContext,
  resourceKey: string,
  actionKey: string,
): Promise<boolean> {
  if (!isPermissionActionKey(actionKey)) return false;
  if (!ctx._grantCache) return evaluatePermissionAction(ctx.userId, resourceKey, actionKey);
  if (ctx.isAdmin) return true;
  if (!isResourceEnabled(resourceKey)) return false;
  if (!isPermissionActionSupported(resourceKey, actionKey)) return false;
  if (isRegisteredSpaceResourceKey(resourceKey) && actionKey !== "entry") return false;
  if (resourceKey === "settings.admin" && actionKey === "entry") {
    return evaluatePermissionAction(ctx.userId, resourceKey, actionKey);
  }

  const capabilityOwnerKey = getCapabilityOwnerKey(resourceKey);
  if (capabilityOwnerKey) {
    if (!isResourceEnabled(capabilityOwnerKey)) return false;
    if (!(await evaluatePermissionWithContext(ctx, capabilityOwnerKey, "entry"))) return false;
  }

  const resources = await loadResourceNodes();
  const byKey = new Map(resources.map((resource) => [resource.key, resource]));
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const resource = byKey.get(resourceKey);
  if (!resource) return false;

  const ancestorIds = getAncestorIds(resource, byId);
  if (
    actionKey !== "grant" &&
    (ctx.isAllResourceAdmin || (ctx.implicitAdminResourceIds ?? []).some((resourceId) => ancestorIds.includes(resourceId)))
  ) {
    return true;
  }

  if (!capabilityOwnerKey && defaultResourceActionAllows(resourceKey, actionKey)) {
    return true;
  }

  const inheritableResourceIds = canPermissionActionInheritFromAncestor(resourceKey, actionKey)
    ? ancestorIds
    : [resource.id];
  const matchingActionKeys = isRegisteredSpaceResourceKey(resourceKey) && actionKey === "entry"
    ? [...PERMISSION_ACTION_KEYS]
    : PERMISSION_ACTION_KEYS.filter((grantedActionKey) =>
        permissionGrantContributesToAction(resourceKey, grantedActionKey, actionKey),
      );

  return grantMapHasAction(ctx._grantCache.userGrants, inheritableResourceIds, matchingActionKeys)
    || grantMapHasAction(ctx._grantCache.positionGrants, inheritableResourceIds, matchingActionKeys)
    || grantMapHasAction(ctx._grantCache.departmentGrants, inheritableResourceIds, matchingActionKeys);
}

/** Kept for callers that batch-warm permission checks; action grants query directly. */
export function _warmCaches(resources: Array<{ id: number; key: string; parentId: number | null }>) {
  resourceNodesCache = resources;
}
