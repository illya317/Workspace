import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - 获取所有部门及其管理员（登录即可访问）
export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // 从 Department 表获取一级部门
  const departments = await prisma.department.findMany({
    where: { level: 1 },
    select: { id: true, name: true, managementGroup: true },
    orderBy: [{ managementGroup: "asc" }, { name: "asc" }],
  });

  // 从 UserResourceRole 获取部门管理员 (resource=people.org, role=admin)
  const admins = await prisma.userResourceRole.findMany({
    where: {
      resource: { key: "people.org" },
      role: { key: "admin" },
    },
    include: {
      user: { select: { id: true, name: true, username: true } },
    },
  });

  return NextResponse.json({ departments, admins });
}

// PUT - 添加部门管理员（登录即可）
export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();
  const { departmentId, userId } = body;
  if (!departmentId || !userId) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  // Find resource and role
  const resource = await prisma.resource.findUnique({ where: { key: "people.org" } });
  const role = await prisma.role.findUnique({ where: { key: "admin" } });
  if (!resource || !role) {
    return NextResponse.json({ error: "系统未初始化RBAC基础数据" }, { status: 500 });
  }

  const scopeId = String(departmentId);

  // Check for existing assignment
  const existing = await prisma.userResourceRole.findFirst({
    where: {
      userId: parseInt(String(userId)),
      resourceId: resource.id,
      roleId: role.id,
      scopeId,
    },
  });
  if (existing) return NextResponse.json({ error: "该用户已是此部门管理员" }, { status: 409 });

  await prisma.userResourceRole.create({
    data: {
      userId: parseInt(String(userId)),
      resourceId: resource.id,
      roleId: role.id,
      scopeId,
    },
  });
  return NextResponse.json({ success: true });
}

// DELETE - 删除部门管理员（登录即可）
export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  await prisma.userResourceRole.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}