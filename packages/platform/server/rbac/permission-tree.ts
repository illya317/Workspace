import { prisma } from "@workspace/platform/server/prisma";
import { RESOURCE_DEFS, RESOURCE_KEYS, getCapabilityOwnerKey, isCapabilityResource, isMainRbacResource } from "@workspace/platform/resources";

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
  enabled?: boolean;
  hidden?: boolean;
  disabledReason?: string | null;
  children?: PermissionResourceNode[];
};

export type PermissionCapabilityNode = Omit<PermissionResourceNode, "children"> & {
  ownerKey: string;
};

function toPermissionNode(
  resource: ResourceTreeRow,
  countMap: Map<number, number>,
  visibleKeys: Set<string>,
  renderableKeys: Set<string>,
  maxRoleMap: Map<string, string>,
  resourceMetaMap: Map<string, { enabled?: boolean; hidden?: boolean; disabledReason?: string | null }>,
): PermissionResourceNode {
  const children = (resource.children || [])
    .map((child) => toPermissionNode(child, countMap, visibleKeys, renderableKeys, maxRoleMap, resourceMetaMap))
    .filter((child) => visibleKeys.has(child.key) && renderableKeys.has(child.key));
  const meta = resourceMetaMap.get(resource.key);

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
    enabled: meta?.enabled,
    hidden: meta?.hidden,
    disabledReason: meta?.disabledReason,
    children,
  };
}

export async function listPermissionResources(input: {
  isSystemAdmin: boolean;
  manageableResourceKeys: Iterable<string>;
}) {
  const activeResourceKeys = new Set(RESOURCE_KEYS);
  const resourceMetaMap = new Map(
    RESOURCE_DEFS.map((resource) => [
      resource.key,
      {
        enabled: resource.enabled,
        hidden: resource.hidden,
        disabledReason: resource.disabledReason ?? null,
      },
    ]),
  );
  const hiddenResourceKeys = new Set(RESOURCE_DEFS.filter((resource) => resource.hidden).map((resource) => resource.key));
  const capabilityKeys = new Set(RESOURCE_DEFS.filter((resource) => resource.kind === "capability").map((resource) => resource.key));
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
  const treeResources = activeResources.filter((resource) => !capabilityKeys.has(resource.key));
  const renderableKeys = new Set(
    treeResources
      .filter((resource) => isMainRbacResource(resource.key) || hiddenResourceKeys.has(resource.key))
      .map((resource) => resource.key),
  );

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

  const resources = treeResources
    .filter((resource) => resource.parentId === null && visibleKeys.has(resource.key) && renderableKeys.has(resource.key))
    .map((resource) => toPermissionNode(resource, countMap, visibleKeys, renderableKeys, effectiveMaxRoleMap, resourceMetaMap));

  const fullTreeVisibleKeys = new Set(renderableKeys);
  const resourceTree = treeResources
    .filter((resource) => resource.parentId === null && renderableKeys.has(resource.key))
    .map((resource) => toPermissionNode(resource, countMap, fullTreeVisibleKeys, renderableKeys, effectiveMaxRoleMap, resourceMetaMap));

  const resourceByKey = new Map(activeResources.map((resource) => [resource.key, resource]));
  const capabilitiesByOwner: Record<string, PermissionCapabilityNode[]> = {};
  for (const capability of activeResources.filter((resource) => isCapabilityResource(resource.key))) {
    const ownerKey = getCapabilityOwnerKey(capability.key);
    if (!ownerKey || !allowedKeys.has(ownerKey)) continue;
    if (!capabilitiesByOwner[ownerKey]) capabilitiesByOwner[ownerKey] = [];
    const node = toPermissionNode(capability, countMap, new Set([capability.key]), new Set([capability.key]), effectiveMaxRoleMap, resourceMetaMap);
    capabilitiesByOwner[ownerKey].push({
      id: node.id,
      key: node.key,
      name: node.name,
      description: node.description,
      parentId: node.parentId,
      sortOrder: node.sortOrder,
      userCount: node.userCount,
      maxRoleKey: node.maxRoleKey,
      effectiveMaxRoleKey: node.effectiveMaxRoleKey,
      scopeTypes: node.scopeTypes,
      scopeInheritanceMode: node.scopeInheritanceMode,
      ownerKey,
    });
    if (!resourceByKey.has(ownerKey)) delete capabilitiesByOwner[ownerKey];
  }

  const roles = (await prisma.role.findMany({ orderBy: { sortOrder: "asc" } })).filter(
    (role) => role.key !== "read",
  );

  return { resources, resourceTree, roles, capabilitiesByOwner };
}
