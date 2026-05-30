import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getManageableResourceKeys } from "@/server/rbac/admin-scope";
import { Prisma } from "@/generated/prisma/client";

type ResourceWithChildren = Prisma.ResourceGetPayload<{
  include: { children: { include: { children: true } } };
}>;

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
  children?: TreeNode[];
}

function buildTree(
  r: ResourceWithChildren,
  countMap: Map<number, number>,
  allowedKeys: Set<string>,
  effectiveMaxRoleMap: Map<string, string>,
): TreeNode | null {
  const children = (r.children || [])
    .map((c) => ({
      id: c.id, key: c.key, name: c.name, description: c.description,
      parentId: c.parentId, sortOrder: c.sortOrder,
      userCount: countMap.get(c.id) || 0,
      maxRoleKey: c.maxRoleKey,
      effectiveMaxRoleKey: effectiveMaxRoleMap.get(c.key) || c.maxRoleKey,
      scopeTypes: c.scopeTypes,
      children: (c.children || [])
        .map((gc) => ({
          id: gc.id, key: gc.key, name: gc.name, description: gc.description,
          parentId: gc.parentId, sortOrder: gc.sortOrder,
          userCount: countMap.get(gc.id) || 0,
          maxRoleKey: gc.maxRoleKey,
          effectiveMaxRoleKey: effectiveMaxRoleMap.get(gc.key) || gc.maxRoleKey,
          scopeTypes: gc.scopeTypes,
        }))
        .filter((gc) => allowedKeys.has(gc.key)),
    }))
    .filter((c) => allowedKeys.has(c.key));

  return {
    id: r.id, key: r.key, name: r.name, description: r.description,
    parentId: r.parentId, sortOrder: r.sortOrder,
    userCount: countMap.get(r.id) || 0,
    maxRoleKey: r.maxRoleKey,
    effectiveMaxRoleKey: effectiveMaxRoleMap.get(r.key) || r.maxRoleKey,
    scopeTypes: r.scopeTypes,
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

  // Count distinct users per resource (deduplicate userIds)
  const resourceIds = allResources.map((r) => r.id);
  const countMap = new Map<number, number>();
  for (const rid of resourceIds) {
    const rows = await prisma.userResourceRole.findMany({
      where: { resourceId: rid, role: { key: "access" }, scopeId: null },
      select: { userId: true },
      distinct: ["userId"],
    });
    countMap.set(rid, rows.length);
  }

  // Compute effective maxRoleKey for each resource (DB parent chain walk)
  const effectiveMaxRoleMap = new Map<string, string>();
  const { getResourceMaxRole } = await import("@/server/rbac/maxRole");
  for (const r of allResources) {
    if (allowedKeys.has(r.key)) {
      effectiveMaxRoleMap.set(r.key, await getResourceMaxRole(r.key));
    }
  }

  // Build tree with user counts, only top-level (parentId=null) returned, filtered by allowedKeys
  const resources = allResources
    .filter((r) => r.parentId === null && allowedKeys.has(r.key))
    .map((r) => buildTree(r, countMap, allowedKeys, effectiveMaxRoleMap))
    .filter((r): r is TreeNode => r !== null);

  const roles = await prisma.role.findMany({
    orderBy: { sortOrder: "asc" },
  });

  // 后台不再展示 read 角色
  const visibleRoles = roles.filter((r) => r.key !== "read");

  return NextResponse.json({ resources, roles: visibleRoles });
}
