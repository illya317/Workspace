import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setGrant, getGrants } from "@workspace/platform/server/auth";
import { getManageableResourceKeys, canManageResourceGrant } from "@workspace/platform/server/auth";

// GET - get all position-level permission grants
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

  const grants = await getGrants("position");
  const filteredGrants = isSysAdmin
    ? grants
    : grants.filter((g) => manageableKeys.has(g.resourceKey));

  // Enrich with resource/position details
  const resourceIds = [...new Set(filteredGrants.map((g) => g.resourceId))];
  const positionIds = [...new Set(filteredGrants.map((g) => g.subjectId))];

  const [resources, positions] = await Promise.all([
    prisma.resource.findMany({
      where: { id: { in: resourceIds } },
      select: { id: true, key: true, name: true },
    }),
    prisma.position.findMany({
      where: { id: { in: positionIds } },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const resMap = new Map(resources.map((r) => [r.id, r]));
  const posMap = new Map(positions.map((p) => [p.id, p]));

  const enriched = filteredGrants.map((g) => ({
    ...g,
    resource: resMap.get(g.resourceId),
    position: posMap.get(g.subjectId),
    role: { key: g.roleKey },
  }));

  return NextResponse.json({ grants: enriched });
}

// PUT - toggle a position-level permission grant
export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json();
  const { positionId, resourceKey, roleKey, value } = body;

  if (!positionId || !resourceKey || !roleKey || typeof value !== "boolean") {
    return NextResponse.json({ error: "参数错误: 需要 positionId, resourceKey, roleKey, value" }, { status: 400 });
  }

  const canManage = await canManageResourceGrant(payload.userId, resourceKey, roleKey);
  if (!canManage) {
    return NextResponse.json({ error: "无权限管理该资源权限" }, { status: 403 });
  }

  try {
    await setGrant("position", positionId, resourceKey, roleKey, value, {
      actorUserId: payload.userId,
    });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "操作失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
