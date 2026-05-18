import { NextResponse } from "next/server";
import { authenticate, checkPermission, getResourceDescendants } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await checkPermission(payload.userId, "system", "admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, resourceKey, roleKey, value } = body;

  if (!userId || !resourceKey || !roleKey || typeof value !== "boolean") {
    return NextResponse.json(
      { error: "参数错误: 需要 userId, resourceKey, roleKey, value" },
      { status: 400 }
    );
  }

  const resource = await prisma.resource.findUnique({
    where: { key: resourceKey },
  });
  const role = await prisma.role.findUnique({
    where: { key: roleKey },
  });

  if (!resource || !role) {
    return NextResponse.json(
      { error: `无效的 resourceKey(${resourceKey}) 或 roleKey(${roleKey})` },
      { status: 400 }
    );
  }

  // 检查资源是否有子资源（父权限只用来一键操作子权限，不给自己加记录）
  const hasChildren = await prisma.resource.findFirst({
    where: { parentId: resource.id },
  });

  if (value) {
    // Grant: 父权限只给子权限加；叶子权限给自己加
    const targetIds = hasChildren
      ? (await getResourceDescendants(resource.id)).filter((id) => id !== resource.id)
      : [resource.id];
    for (const rid of targetIds) {
      const existing = await prisma.userResourceRole.findFirst({
        where: {
          userId,
          resourceId: rid,
          roleId: role.id,
          scopeId: null,
        },
      });
      if (!existing) {
        await prisma.userResourceRole.create({
          data: {
            userId,
            resourceId: rid,
            roleId: role.id,
            scopeId: null,
          },
        });
      }
    }
  } else {
    // 禁止取消自己的系统管理员权限
    if (resourceKey === "system" && roleKey === "admin" && userId === payload.userId) {
      return NextResponse.json({ error: "不能取消自己的系统管理员权限" }, { status: 403 });
    }
    // Revoke: 父权限删除所有子权限；叶子权限删除自己
    const targetIds = hasChildren
      ? (await getResourceDescendants(resource.id)).filter((id) => id !== resource.id)
      : [resource.id];
    await prisma.userResourceRole.deleteMany({
      where: {
        userId,
        resourceId: { in: targetIds },
        roleId: role.id,
        scopeId: null,
      },
    });
  }

  return NextResponse.json({ success: true });
}
