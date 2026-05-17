import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  // Check super admin access (both old isWorkListAdmin AND new system.admin)
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });
  const isSuperAdmin = user?.isWorkListAdmin || (await checkPermission(payload.userId, "system.admin"));
  if (!isSuperAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const categories = await prisma.permissionCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      permissions: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, key: true, name: true, description: true, sortOrder: true },
      },
    },
  });

  // Get user counts for each permission
  for (const cat of categories) {
    for (const perm of cat.permissions) {
      const count = await prisma.userPermission.count({
        where: { permissionId: perm.id },
      });
      (perm as any).userCount = count;
    }
  }

  return NextResponse.json({ categories });
}
