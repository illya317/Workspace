import { NextResponse } from "next/server";
import { authenticate, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const depts = await prisma.department.findMany({
    where: { level: 1, managementGroup: { not: "加拿大" } },
    orderBy: [{ managementGroup: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    departments: depts.map((d: any) => ({
      id: d.id,
      name: d.name,
      managementGroup: d.managementGroup || "",
      count: 0,
    })),
  });
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { departmentId } = body;

  if (!departmentId) {
    return NextResponse.json({ error: "缺少 departmentId" }, { status: 400 });
  }

  try {
    await prisma.department.delete({
      where: { id: departmentId },
    });
    return NextResponse.json({ success: true, message: "部门已删除" });
  } catch {
    return NextResponse.json({ error: "删除失败，部门可能不存在或有关联数据" }, { status: 400 });
  }
}
