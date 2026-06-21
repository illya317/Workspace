import { prisma } from "@workspace/platform/server/prisma";
import { RESOURCE_KEYS } from "@workspace/platform/resources";

import { getResourceMaxRole } from "./maxRole";

type ResourceTreeRow = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  parentId: number | null;
  sortOrder: number | null;
  maxRoleKey: string;
  scopeTypes: string | null;
  scopeInheritanceMode: string | null;
  children?: ResourceTreeRow[];
};

export type PermissionResourceNode = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  parentId: number | null;
  sortOrder: number | null;
  userCount: number;
  maxRoleKey: string;
  effectiveMaxRoleKey: string;
  scopeTypes: string | null;
  scopeInheritanceMode: string | null;
  children?: PermissionResourceNode[];
};

function toPermissionNode(
  resource: ResourceTreeRow,
  countMap: Map<number, number>,
  visibleKeys: Set<string>,
  maxRoleMap: Map<string, string>,
): PermissionResourceNode {
  const children = (resource.children || [])
    .map((child) => toPermissionNode(child, countMap, visibleKeys, maxRoleMap))
    .filter((child) => visibleKeys.has(child.key));

  return {
    id: resource.id,
    key: resource.key,
    name: resource.name,
    description: resource.description,
    parentId: resource.parentId,
    sortOrder: resource.sortOrder,
    userCount: countMap.get(resource.id) || 0,
    maxRoleKey: resource.maxRoleKey,
    effectiveMaxRoleKey: maxRoleMap.get(resource.key) || resource.maxRoleKey,
    scopeTypes: resource.scopeTypes,
    scopeInheritanceMode: resource.scopeInheritanceMode,
    children,
  };
}

export async function listPermissionResources(input: {
  isSystemAdmin: boolean;
  manageableResourceKeys: Iterable<string>;
}) {
  const activeResourceKeys = new Set(RESOURCE_KEYS);
  const allResources = await prisma.resource.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      children: {
        orderBy: { sortOrder: "asc" },
        include: {
          children: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
  const activeResources = allResources.filter((resource) => activeResourceKeys.has(resource.key));

  const allowedKeys = input.isSystemAdmin
    ? new Set(activeResources.map((resource) => resource.key))
    : new Set([...input.manageableResourceKeys].filter((key) => activeResourceKeys.has(key)));

  const countMap = new Map<number, number>();
  await Promise.all(
    activeResources.map(async (resource) => {
      const rows = await prisma.userResourceRole.findMany({
        where: { resourceId: resource.id, scopeId: null },
        select: { userId: true },
        distinct: ["userId"],
      });
      countMap.set(resource.id, rows.length);
    }),
  );

  const effectiveMaxRoleMap = new Map<string, string>();
  await Promise.all(
    activeResources.map(async (resource) => {
      if (allowedKeys.has(resource.key)) {
        effectiveMaxRoleMap.set(resource.key, await getResourceMaxRole(resource.key));
      }
    }),
  );

  const idToKey = new Map(allResources.map((resource) => [resource.id, resource.key]));
  const keyToParent = new Map(
    allResources
      .filter((resource) => resource.parentId)
      .map((resource) => [resource.key, idToKey.get(resource.parentId!)]),
  );
  const visibleKeys = new Set(allowedKeys);
  for (const key of allowedKeys) {
    for (let current = keyToParent.get(key); current; current = keyToParent.get(current)) {
      visibleKeys.add(current);
    }
  }

  const resources = activeResources
    .filter((resource) => resource.parentId === null && visibleKeys.has(resource.key))
    .map((resource) => toPermissionNode(resource, countMap, visibleKeys, effectiveMaxRoleMap));

  const fullTreeVisibleKeys = new Set(activeResources.map((resource) => resource.key));
  const resourceTree = activeResources
    .filter((resource) => resource.parentId === null)
    .map((resource) => toPermissionNode(resource, countMap, fullTreeVisibleKeys, effectiveMaxRoleMap));

  const roles = (await prisma.role.findMany({ orderBy: { sortOrder: "asc" } })).filter(
    (role) => role.key !== "read",
  );

  return { resources, resourceTree, roles };
}
