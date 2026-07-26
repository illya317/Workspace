import "server-only";

import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { isRootAdminUser } from "../auth/root";
import { evaluatePermissionAction } from "./action-grants";
import { getUserDepartmentIds, getUserPositionIds } from "./helpers";
import { getSpaceEntryResourceKeysForUser } from "./space-entry";

type ResourceNode = {
  id: number;
  key: string;
  parentId: number | null;
};

let resourceTreeCache: ResourceNode[] | null = null;

async function loadResourceTree() {
  if (!resourceTreeCache) {
    resourceTreeCache = await prisma.resource.findMany({
      select: { id: true, key: true, parentId: true },
    });
  }
  return resourceTreeCache;
}

function addAncestors(resource: ResourceNode, byId: Map<number, ResourceNode>, output: Set<string>) {
  let current: ResourceNode | undefined = resource;
  while (current) {
    if (isResourceEnabled(current.key)) output.add(current.key);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
}

async function getScopedGrantResourceKeys(userId: number) {
  const [positionIds, departmentIds] = await Promise.all([
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
  ]);
  const [userActions, positionActions, departmentActions] = await Promise.all([
    prisma.userResourceActionGrant.findMany({
      where: { userId, scopeId: { not: null } },
      select: { resource: { select: { key: true } } },
    }),
    positionIds.length ? prisma.positionResourceActionGrant.findMany({
      where: { positionId: { in: positionIds }, scopeId: { not: null } },
      select: { resource: { select: { key: true } } },
    }) : Promise.resolve([]),
    departmentIds.length ? prisma.departmentResourceActionGrant.findMany({
      where: { departmentId: { in: departmentIds }, scopeId: { not: null } },
      select: { resource: { select: { key: true } } },
    }) : Promise.resolve([]),
  ]);
  return new Set([
    ...userActions,
    ...positionActions,
    ...departmentActions,
  ].map((grant) => grant.resource.key).filter(isResourceEnabled));
}

export async function getResourceEntryKeys(userId: number) {
  if (await isRootAdminUser(userId)) {
    return new Set((await loadResourceTree()).map((resource) => resource.key).filter(isResourceEnabled));
  }

  const resources = await loadResourceTree();
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const byKey = new Map(resources.map((resource) => [resource.key, resource]));
  const keys = new Set<string>();

  const scopedGrantKeys = await getScopedGrantResourceKeys(userId);
  for (const key of scopedGrantKeys) {
    const resource = byKey.get(key);
    if (resource) addAncestors(resource, byId, keys);
  }

  for (const key of await getSpaceEntryResourceKeysForUser(userId)) {
    if (byKey.has(key) && isResourceEnabled(key)) keys.add(key);
  }

  return keys;
}

export async function canEnterResource(userId: number, resourceKey: string) {
  if (!isResourceEnabled(resourceKey)) return false;
  if (await evaluatePermissionAction(userId, resourceKey, "entry")) return true;
  const resources = await loadResourceTree();
  const byKey = new Map(resources.map((resource) => [resource.key, resource]));
  const target = byKey.get(resourceKey);
  if (!target) return false;
  return (await getResourceEntryKeys(userId)).has(resourceKey);
}
