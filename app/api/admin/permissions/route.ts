import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getManageableResourceKeys } from "@/server/rbac/admin-scope";

interface TreeNode {
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
  children?: TreeNode[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toNode(r: any, countMap: Map<number, number>, allowedKeys: Set<string>, maxMap: Map<string, string>): TreeNode {
  const children = ((r as any).children || [])
    .map((c: any) => toNode(c, countMap, allowedKeys, maxMap))
/* eslint-enable @typescript-eslint/no-explicit-any */
    .filter((c: TreeNode) => allowedKeys.has(c.key));
  return {
    id: r.id, key: r.key, name: r.name, description: r.description,
    parentId: r.parentId, sortOrder: r.sortOrder,
    userCount: countMap.get(r.id) || 0,
    maxRoleKey: r.maxRoleKey,
    effectiveMaxRoleKey: maxMap.get(r.key) || r.maxRoleKey,
    scopeTypes: r.scopeTypes,
    scopeInheritanceMode: r.scopeInheritanceMode,
    children,
  };
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const isSysAdmin = await checkPermission(payload.userId, "system", "admin");
  const manageableKeys = await getManageableResourceKeys(payload.userId);

  if (!isSysAdmin && manageableKeys.size === 0) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  // RBAC v2: return resource tree with children
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

  const allowedKeys = isSysAdmin
    ? new Set(allResources.map((r) => r.key))
    : manageableKeys;

  // Count distinct users with any grant per resource (not just access)
  const countMap = new Map<number, number>();
  for (const r of allResources) {
    const rows = await prisma.userResourceRole.findMany({
      where: { resourceId: r.id, scopeId: null },
      select: { userId: true }, distinct: ["userId"],
    });
    countMap.set(r.id, rows.length);
  }

  // Effective maxRoleKey per resource
  const { getResourceMaxRole } = await import("@/server/rbac/maxRole");
  const effectiveMaxRoleMap = new Map<string, string>();
  for (const r of allResources) {
    if (allowedKeys.has(r.key)) effectiveMaxRoleMap.set(r.key, await getResourceMaxRole(r.key));
  }

  // Expand allowedKeys → include ancestors (tree doesn't break on partial grants)
  const idToKey = new Map(allResources.map((r) => [r.id, r.key]));
  const keyToParent = new Map(allResources.filter((r) => r.parentId).map((r) => [r.key, idToKey.get(r.parentId!)]));
  const visibleKeys = new Set(allowedKeys);
  for (const key of allowedKeys) {
    for (let k = keyToParent.get(key); k; k = keyToParent.get(k)) visibleKeys.add(k);
  }

  const resources = allResources
    .filter((r) => r.parentId === null && visibleKeys.has(r.key))
    .map((r) => toNode(r, countMap, visibleKeys, effectiveMaxRoleMap))
    .filter((r): r is TreeNode => r !== null);

  const roles = (await prisma.role.findMany({ orderBy: { sortOrder: "asc" } })).filter((r) => r.key !== "read");

  return NextResponse.json({ resources, roles });
}
