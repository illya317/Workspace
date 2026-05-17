import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function buildTree(r: any, countMap: Map<number, number>): any {
  const children = (r.children || []).map((c: any) => ({
    id: c.id, key: c.key, name: c.name, description: c.description,
    parentId: c.parentId, sortOrder: c.sortOrder,
    userCount: countMap.get(c.id) || 0,
    children: (c.children || []).map((gc: any) => ({
      id: gc.id, key: gc.key, name: gc.name, description: gc.description,
      parentId: gc.parentId, sortOrder: gc.sortOrder,
      userCount: countMap.get(gc.id) || 0,
    })),
  }));
  return {
    id: r.id, key: r.key, name: r.name, description: r.description,
    parentId: r.parentId, sortOrder: r.sortOrder,
    userCount: countMap.get(r.id) || 0,
    children,
  };
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await checkPermission(payload.userId, "system", "admin"))) {
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

  // Build tree with user counts, only top-level returned
  const resources = allResources
    .filter((r) => r.parentId === null)
    .map((r) => buildTree(r, countMap));

  const roles = await prisma.role.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ resources, roles });
}