import { prisma } from "@workspace/platform/server/prisma";

let resourceCache: { id: number; parentId: number | null }[] | null = null;

export function invalidateResourceCache() {
  resourceCache = null;
}

export async function getResourceDescendants(resourceId: number): Promise<number[]> {
  if (!resourceCache) {
    resourceCache = await prisma.resource.findMany({
      select: { id: true, parentId: true },
    });
  }

  const byParent = new Map<number, number[]>();
  for (const r of resourceCache) {
    if (r.parentId != null) {
      byParent.set(r.parentId, [...(byParent.get(r.parentId) || []), r.id]);
    }
  }

  const result: number[] = [];
  function dfs(id: number) {
    result.push(id);
    for (const child of byParent.get(id) || []) dfs(child);
  }
  dfs(resourceId);
  return result;
}

export async function getResourceAncestors(resourceId: number): Promise<number[]> {
  if (!resourceCache) {
    resourceCache = await prisma.resource.findMany({
      select: { id: true, parentId: true },
    });
  }

  const byId = new Map<number, number | null>();
  for (const r of resourceCache) byId.set(r.id, r.parentId);

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

export async function getResourceAncestorKeys(resourceKey: string): Promise<string[]> {
  const resource = await prisma.resource.findUnique({
    where: { key: resourceKey },
    select: { id: true },
  });
  if (!resource) return [];

  const ancestorIds = await getResourceAncestors(resource.id);
  const resources = await prisma.resource.findMany({
    where: { id: { in: ancestorIds } },
    select: { id: true, key: true },
  });
  const keyById = new Map(resources.map((item) => [item.id, item.key]));
  return ancestorIds
    .map((id) => keyById.get(id))
    .filter((key): key is string => Boolean(key));
}

export async function getResourceSummariesByIds(resourceIds: number[]) {
  return prisma.resource.findMany({
    where: { id: { in: resourceIds } },
    select: { id: true, key: true, name: true },
  });
}
