import { NextResponse } from "next/server";
import { authenticate, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });

  let groups;
  if (user?.isWorkListAdmin) {
    groups = await prisma.reportGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        department: { select: { id: true, name: true } },
        _count: {
          select: { members: true, viewers: true, reports: true },
        },
      },
    });
  } else {
    // 周报管理员：只返回自己管理的
    const adminGroups = await prisma.reportGroupAdmin.findMany({
      where: { userId: payload.userId },
      select: { reportGroupId: true },
    });
    const groupIds = adminGroups.map((a) => a.reportGroupId);
    if (groupIds.length === 0) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    groups = await prisma.reportGroup.findMany({
      where: { id: { in: groupIds } },
      orderBy: { sortOrder: "asc" },
      include: {
        department: { select: { id: true, name: true } },
        _count: {
          select: { members: true, viewers: true, reports: true },
        },
      },
    });
  }

  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { name, description, sortOrder, departmentId } = body;

  if (!name) {
    return NextResponse.json({ error: "名称不能为空" }, { status: 400 });
  }

  const group = await prisma.reportGroup.create({
    data: {
      name,
      description: description || null,
      sortOrder: sortOrder ?? 0,
      departmentId: departmentId || null,
    },
  });

  return NextResponse.json({ group });
}
