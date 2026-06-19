/**
 * Resource visibility helper — computes which resources a user can "see"
 * based on their access grants. A resource is visible if the user has the
 * required role on it OR on any of its descendants.
 *
 * This replaces hand-crafted OR chains in session.ts.
 */

import { prisma } from "@/lib/prisma";
import { evaluatePermissionWithContext } from "./check";
import type { PermissionContext } from "./types";

interface ResNode {
  id: number;
  key: string;
  parentId: number | null;
}

let _resCache: ResNode[] | null = null;

async function loadResources(): Promise<ResNode[]> {
  if (!_resCache) {
    _resCache = await prisma.resource.findMany({
      select: { id: true, key: true, parentId: true },
    });
  }
  return _resCache;
}

/** Clear resource cache (call after seed/DB changes) */
export function clearResourceCache() { _resCache = null; }

/**
 * Get all resource keys visible to the user for a given role.
 * A resource is visible if the user has the role on it OR any descendant.
 */
export async function getVisibleResourceKeys(
  ctx: PermissionContext,
  roleKey: string = "access",
): Promise<Set<string>> {
  const resources = await loadResources();
  const byId = new Map(resources.map((r) => [r.id, r]));
  const visible = new Set<string>();

  // Check each resource; if granted, walk up ancestors
  for (const r of resources) {
    if (await evaluatePermissionWithContext(ctx, r.key, roleKey)) {
      let cur: ResNode | undefined = r;
      while (cur) {
        visible.add(cur.key);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
    }
  }

  return visible;
}

/**
 * Check if a resource (or any descendant) is accessible.
 */
export async function hasResourceVisible(
  ctx: PermissionContext,
  resourceKey: string,
  roleKey: string = "access",
): Promise<boolean> {
  const visible = await getVisibleResourceKeys(ctx, roleKey);
  return visible.has(resourceKey);
}
