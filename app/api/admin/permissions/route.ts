import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  // Compute user counts for each resource
  const resourceIds = allResources.map((r) => r.id);
  const counts = await prisma.userResourceRole.groupBy({
    by: ["resourceId"],
    where: {
      resourceId: { in: resourceIds },
      role: { key: "access" },
      scopeId: null,
    },
    _count: true,
  });
  const countMap = new Map(counts.map((c) => [c.resourceId, c._count]));

  // Return ALL resources (flat) with userCount, let frontend build tree
  const resources = allResources.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    parentId: r.parentId,
    sortOrder: r.sortOrder,
    userCount: countMap.get(r.id) || 0,
    children: (r as any).children?.map((c: any) => ({
      id: c.id, key: c.key, name: c.name, description: c.description,
      parentId: c.parentId, sortOrder: c.sortOrder,
      userCount: countMap.get(c.id) || 0,
      children: (c.children || []).map((gc: any) => ({
        id: gc.id, key: gc.key, name: gc.name, description: gc.description,
        parentId: gc.parentId, sortOrder: gc.sortOrder,
        userCount: countMap.get(gc.id) || 0,
      })),
    })),
  }));

  const roles = await prisma.role.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ resources, roles });
}