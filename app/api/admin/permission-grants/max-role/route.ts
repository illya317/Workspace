/** PATCH: 更新资源最高权限（仅 system.admin） */
import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";

const ROLE_HIERARCHY: Record<string, number> = { access: 0, write: 1, delete: 2, admin: 3 };

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

  // 禁止降级 system 最高权限
  if (resourceKey === "system" && maxRoleKey !== "admin") {
    return NextResponse.json({ error: "系统资源最高权限不可低于管理" }, { status: 400 });
  }

  // 检查父级上限
  const { prisma } = await import("@/lib/prisma");
  const res = await prisma.resource.findUnique({
    where: { key: resourceKey },
    select: { parent: { select: { key: true, maxRoleKey: true } } },
  });
  if (res?.parent) {
    const parentLevel = ROLE_HIERARCHY[res.parent.maxRoleKey] ?? 3;
    const newLevel = ROLE_HIERARCHY[maxRoleKey] ?? 3;
    if (newLevel > parentLevel) {
      const labels: Record<string, string> = { access: "访问", write: "编辑", delete: "删除", admin: "管理" };
      return NextResponse.json({
        error: `父资源"${res.parent.key}"最高仅${labels[res.parent.maxRoleKey]}，子资源不可超过`,
      }, { status: 400 });
    }
  }

  await prisma.resource.update({ where: { key: resourceKey }, data: { maxRoleKey } });
  const { clearMaxRoleCache } = await import("@/server/rbac/maxRole");
  clearMaxRoleCache();

  return NextResponse.json({ success: true, maxRoleKey });
}
