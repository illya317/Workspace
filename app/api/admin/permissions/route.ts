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

  // Build tree: return only top-level resources (parentId === null)
  const resources = allResources
    .filter((r) => r.parentId === null)
    .map((r) => {
      // Count users with global "access" role (self + descendants)
      return {
        ...r,
        userCount: 0, // Will be computed below
      };
    });

  const roles = await prisma.role.findMany({
    orderBy: { sortOrder: "asc" },
  });

  // For each resource (flat), count users with global "access" role
  for (const r of allResources) {
    const count = await prisma.userResourceRole.count({
      where: {
        resourceId: r.id,
        role: { key: "access" },
        scopeId: null,
      },
    });
    // Attach userCount to the resource in the flat list
    (r as any).userCount = count;
  }

  return NextResponse.json({ resources, roles });
}