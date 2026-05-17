import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - get all position-level permission grants
export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const isSuperAdmin = await checkPermission(payload.userId, "system.admin");
  if (!isSuperAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  // Get all UserResourceRole entries with positionId set
  const grants = await prisma.userResourceRole.findMany({
    where: { positionId: { not: null } },
    include: {
      resource: { select: { id: true, key: true, name: true } },
      role: { select: { id: true, key: true, name: true } },
      position: { select: { id: true, code: true, name: true, companyCode: true } },
    },
    orderBy: [
      { position: { companyCode: "asc" } },
      { position: { code: "asc" } },
    ],
  });

  return NextResponse.json({ grants });
}

// PUT - toggle a position-level permission grant
export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const isSuperAdmin = await checkPermission(payload.userId, "system.admin");
  if (!isSuperAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { positionId, resourceKey, roleKey, value } = body;

  if (!positionId || !resourceKey || !roleKey || typeof value !== "boolean") {
    return NextResponse.json({ error: "参数错误: 需要 positionId, resourceKey, roleKey, value" }, { status: 400 });
  }

  const resource = await prisma.resource.findUnique({ where: { key: resourceKey } });
  const role = await prisma.role.findUnique({ where: { key: roleKey } });

  if (!resource || !role) {
    return NextResponse.json({ error: "无效的resourceKey或roleKey" }, { status: 400 });
  }

  if (value) {
    // Grant: create if not exists
    const existing = await prisma.userResourceRole.findFirst({
      where: {
        positionId,
        resourceId: resource.id,
        roleId: role.id,
        userId: null,
      },
    });
    if (!existing) {
      await prisma.userResourceRole.create({
        data: {
          positionId,
          resourceId: resource.id,
          roleId: role.id,
          scopeId: null,
        },
      });
    }
  } else {
    // Revoke: delete if exists
    await prisma.userResourceRole.deleteMany({
      where: {
        positionId,
        resourceId: resource.id,
        roleId: role.id,
      },
    });
  }

  return NextResponse.json({ success: true });
}
