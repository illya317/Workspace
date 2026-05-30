/** PATCH: 更新资源最高权限（仅 system.admin） */
import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";

export async function PATCH(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const isSysAdmin = await checkPermission(payload.userId, "system", "admin");
  if (!isSysAdmin) return NextResponse.json({ error: "仅系统管理员可修改" }, { status: 403 });

  const body = await request.json();
  const { resourceKey, maxRoleKey } = body;
  if (!resourceKey || !maxRoleKey) return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  if (!["access", "write", "delete", "admin"].includes(maxRoleKey)) {
    return NextResponse.json({ error: "无效角色" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  await prisma.resource.update({ where: { key: resourceKey }, data: { maxRoleKey } });
  const { clearMaxRoleCache } = await import("@/server/rbac/maxRole");
  clearMaxRoleCache();

  return NextResponse.json({ success: true, maxRoleKey });
}
