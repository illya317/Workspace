import { prisma, type Prisma } from "@workspace/platform/server/prisma";
import { RESOURCE_DEFS } from "@workspace/platform/resources";
import {
  getResourceAncestorKeys,
  getResourceAncestors,
  getResourceChildKeys,
  getResourceDescendants,
  getResourceDescendantsForRoots,
} from "./resource";

export type PermissionResourceProjectionKind = "default" | "space";
type PermissionDatabaseClient = Prisma.TransactionClient | typeof prisma;

export interface PermissionResourceProjection {
  kind?: PermissionResourceProjectionKind;
  scopeId?: string | null;
}

export interface PermissionResourceProjectionTreeNode {
  key: string;
  parentKey: string | null;
  children: PermissionResourceProjectionTreeNode[];
}

export function normalizePermissionResourceProjection(
  projection?: PermissionResourceProjection | PermissionResourceProjectionKind | null,
): PermissionResourceProjection {
  if (!projection) return { kind: "default" };
  return typeof projection === "string" ? { kind: projection } : { kind: projection.kind ?? "default", scopeId: projection.scopeId };
}

export async function getProjectedAncestorResourceKeys(
  resourceKey: string,
  projection?: PermissionResourceProjection | PermissionResourceProjectionKind | null,
) {
  void normalizePermissionResourceProjection(projection);
  return getResourceAncestorKeys(resourceKey);
}

export async function getProjectedChildResourceKeys(
  resourceKey: string,
  projection?: PermissionResourceProjection | PermissionResourceProjectionKind | null,
) {
  void normalizePermissionResourceProjection(projection);
  return getResourceChildKeys(resourceKey);
}

export function getPermissionProjectionTree(
  projection?: PermissionResourceProjection | PermissionResourceProjectionKind | null,
): PermissionResourceProjectionTreeNode[] {
  void normalizePermissionResourceProjection(projection);
  const nodes = new Map<string, PermissionResourceProjectionTreeNode>();
  for (const resource of RESOURCE_DEFS) {
    nodes.set(resource.key, { key: resource.key, parentKey: resource.parentKey ?? null, children: [] });
  }
  const roots: PermissionResourceProjectionTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentKey && nodes.has(node.parentKey)) {
      nodes.get(node.parentKey)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function getProjectedAncestorResourceIds(
  resourceKey: string,
  projection?: PermissionResourceProjection | PermissionResourceProjectionKind | null,
  client: PermissionDatabaseClient = prisma,
) {
  void normalizePermissionResourceProjection(projection);
  const resource = await client.resource.findUnique({ where: { key: resourceKey }, select: { id: true } });
  return resource ? getResourceAncestors(resource.id, client) : [];
}

export async function getProjectedDescendantResourceIds(
  resourceId: number,
  projection?: PermissionResourceProjection | PermissionResourceProjectionKind | null,
  client: PermissionDatabaseClient = prisma,
) {
  void normalizePermissionResourceProjection(projection);
  return getResourceDescendants(resourceId, client);
}

export async function getProjectedDescendantResourceIdsForRoots(
  resourceIds: readonly number[],
  projection?: PermissionResourceProjection | PermissionResourceProjectionKind | null,
  client: PermissionDatabaseClient = prisma,
) {
  void normalizePermissionResourceProjection(projection);
  return getResourceDescendantsForRoots(resourceIds, client);
}
