import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  // Check system admin access
  if (!(await checkPermission(payload.userId, "system.admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const resources = await prisma.resource.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const roles = await prisma.role.findMany({
    orderBy: { sortOrder: "asc" },
  });

  // For each resource, count users with global "access" role
  for (const r of resources) {
    const count = await prisma.userResourceRole.count({
      where: {
        resourceId: r.id,
        role: { key: "access" },
        scopeId: null,
      },
    });
    (r as any).userCount = count;
  }

  return NextResponse.json({ resources, roles });
}
