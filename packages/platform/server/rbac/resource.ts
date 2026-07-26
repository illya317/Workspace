import { prisma, type Prisma } from "@workspace/platform/server/prisma";

let resourceCache: { id: number; parentId: number | null }[] | null = null;
type PermissionDatabaseClient = Prisma.TransactionClient | typeof prisma;
const transactionResourceCache = new WeakMap<object, Promise<{ id: number; parentId: number | null }[]>>();

export function invalidateResourceCache() {
  resourceCache = null;
}

async function loadResourceTree(client: PermissionDatabaseClient) {
  if (client === prisma && resourceCache) return resourceCache;
  if (client !== prisma) {
    let cached = transactionResourceCache.get(client);
    if (!cached) {
      cached = client.resource.findMany({ select: { id: true, parentId: true } });
      transactionResourceCache.set(client, cached);
    }
    return cached;
  }
  const resources = await client.resource.findMany({
      select: { id: true, parentId: true },
  });
  resourceCache = resources;
  return resources;
}

export async function getResourceDescendantsForRoots(
  resourceIds: readonly number[],
  client: PermissionDatabaseClient = prisma,
): Promise<number[]> {
  const resources = await loadResourceTree(client);
  const byParent = new Map<number, number[]>();
  for (const r of resources) {
    if (r.parentId != null) {
      byParent.set(r.parentId, [...(byParent.get(r.parentId) || []), r.id]);
    }
  }

  const result = new Set<number>();
  function dfs(id: number) {
    if (result.has(id)) return;
    result.add(id);
    for (const child of byParent.get(id) || []) dfs(child);
  }
  resourceIds.forEach(dfs);
  return [...result];
}

export async function getResourceDescendants(resourceId: number, client: PermissionDatabaseClient = prisma): Promise<number[]> {
  return getResourceDescendantsForRoots([resourceId], client);
}

export async function getResourceAncestors(resourceId: number, client: PermissionDatabaseClient = prisma): Promise<number[]> {
  const resources = await loadResourceTree(client);

  const byId = new Map<number, number | null>();
  for (const r of resources) byId.set(r.id, r.parentId);

  const result: number[] = [];
  let current = resourceId;
  while (true) {
    result.push(current);
    const parent = byId.get(current);
    if (parent == null) break;
    current = parent;
  }
  return result;
}

export async function getResourceAncestorKeys(resourceKey: string, client: PermissionDatabaseClient = prisma): Promise<string[]> {
  const resource = await client.resource.findUnique({
    where: { key: resourceKey },
    select: { id: true },
  });
  if (!resource) return [];

  const ancestorIds = await getResourceAncestors(resource.id, client);
  const resources = await client.resource.findMany({
    where: { id: { in: ancestorIds } },
    select: { id: true, key: true },
  });
  const keyById = new Map(resources.map((item) => [item.id, item.key]));
  return ancestorIds
    .map((id) => keyById.get(id))
    .filter((key): key is string => Boolean(key));
}

export async function getResourceChildKeys(resourceKey: string, client: PermissionDatabaseClient = prisma): Promise<string[]> {
  const resource = await client.resource.findUnique({
    where: { key: resourceKey },
    select: { children: { select: { key: true } } },
  });
  return resource?.children.map((child) => child.key) ?? [];
}

export async function getResourceSummariesByIds(resourceIds: number[], client: PermissionDatabaseClient = prisma) {
  return client.resource.findMany({
    where: { id: { in: resourceIds } },
    select: { id: true, key: true, name: true },
  });
}
