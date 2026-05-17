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
    select: { id: true, name: true, company: true },
    orderBy: [{ company: "asc" }, { name: "asc" }],
  });

  // 获取所有部门管理员
  const admins = await prisma.departmentAdmin.findMany({
    include: { user: { select: { id: true, name: true, username: true, employeeId: true } } },
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

  const existing = await prisma.departmentAdmin.findUnique({
    where: { userId_departmentId: { userId: parseInt(userId), departmentId: parseInt(departmentId) } },
  });
  if (existing) return NextResponse.json({ error: "该用户已是此部门管理员" }, { status: 409 });

  await prisma.departmentAdmin.create({
    data: { departmentId: parseInt(departmentId), userId: parseInt(userId) },
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

  await prisma.departmentAdmin.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
