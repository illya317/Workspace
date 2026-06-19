import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setGrant, getGrants } from "@workspace/platform/server/auth";
import { getManageableResourceKeys, canManageResourceGrant } from "@workspace/platform/server/auth";

// GET - get all department-level permission grants
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

  const grants = await getGrants("department");
  const filteredGrants = isSysAdmin
    ? grants
    : grants.filter((g) => manageableKeys.has(g.resourceKey));

  const resourceIds = [...new Set(filteredGrants.map((g) => g.resourceId))];
  const departmentIds = [...new Set(filteredGrants.map((g) => g.subjectId))];

  const [resources, departments] = await Promise.all([
    prisma.resource.findMany({
      where: { id: { in: resourceIds } },
      select: { id: true, key: true, name: true },
    }),
    prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const resMap = new Map(resources.map((r) => [r.id, r]));
  const deptMap = new Map(departments.map((d) => [d.id, d]));

  const enriched = filteredGrants.map((g) => ({
    ...g,
    resource: resMap.get(g.resourceId),
    department: deptMap.get(g.subjectId),
    role: { key: g.roleKey },
  }));

  return NextResponse.json({ grants: enriched });
}

// PUT - toggle a department-level permission grant
export async function PUT(request: Request) {
  try {
    const payload = await authenticate(request);
    if (!payload) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const { departmentId, resourceKey, roleKey, value } = body;

    if (!departmentId || !resourceKey || !roleKey || typeof value !== "boolean") {
      return NextResponse.json(
        { error: "参数错误: 需要 departmentId, resourceKey, roleKey, value" },
        { status: 400 }
      );
    }

    const canManage = await canManageResourceGrant(payload.userId, resourceKey, roleKey);
    if (!canManage) {
      return NextResponse.json({ error: "无权限管理该资源权限" }, { status: 403 });
    }

    await setGrant("department", Number(departmentId), resourceKey, roleKey, value, {
      actorUserId: payload.userId,
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("department-permissions PUT error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
