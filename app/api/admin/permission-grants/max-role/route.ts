/** PATCH: 更新资源最高权限（仅 system.admin） */
import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";

const ROLE_HIERARCHY: Record<string, number> = { access: 0, write: 1, delete: 2, admin: 3 };
const LABELS: Record<string, string> = { access: "访问", write: "编辑", delete: "删除", admin: "管理" };

export async function PATCH(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const isSysAdmin = await checkPermission(payload.userId, "system", "admin");
  if (!isSysAdmin) return NextResponse.json({ error: "仅系统管理员可修改" }, { status: 403 });

  const body = await request.json();
  const { resourceKey, maxRoleKey } = body;
  if (!resourceKey || !maxRoleKey) return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  if (resourceKey !== "system" && !["access", "write", "delete"].includes(maxRoleKey)) {
    return NextResponse.json({ error: "最高业务权限仅支持访问/编辑/删除" }, { status: 400 });
  }
  if (resourceKey === "system" && maxRoleKey !== "admin") {
    return NextResponse.json({ error: "系统资源最高权限不可低于管理" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const res = await prisma.resource.findUnique({
    where: { key: resourceKey },
    select: { id: true, parent: { select: { key: true } } },
  });
  if (!res) return NextResponse.json({ error: "资源不存在" }, { status: 404 });

  // 父级有效上限（走 DB parent 链，含祖父级）
  if (res.parent) {
    const { getResourceMaxRole } = await import("@workspace/platform/server/auth");
    const parentMax = await getResourceMaxRole(res.parent.key);
    const parentLevel = ROLE_HIERARCHY[parentMax] ?? 3;
    const newLevel = ROLE_HIERARCHY[maxRoleKey] ?? 3;
    if (newLevel > parentLevel) {
      return NextResponse.json({
        error: `父资源"${res.parent.key}"有效上限为${LABELS[parentMax]}，子资源不可超过`,
      }, { status: 400 });
    }
  }

  await prisma.resource.update({ where: { key: resourceKey }, data: { maxRoleKey } });
  const { clearMaxRoleCache } = await import("@workspace/platform/server/auth");
  clearMaxRoleCache();

  return NextResponse.json({ success: true, maxRoleKey });
}
