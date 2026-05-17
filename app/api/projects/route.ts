import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId)))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      departments: { include: { department: { select: { id: true, name: true } } } },
      _count: { select: { employees: true } },
    },
  });
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId)))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { name, type, departmentIds, description } = await request.json();
  if (!name) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      name,
      type: type || "project",
      description: description || null,
      editedBy: payload.userId,
      departments: departmentIds?.length ? {
        create: departmentIds.map((deptId: number) => ({ departmentId: deptId })),
      } : undefined,
    },
  });
  return NextResponse.json({ project });
}
