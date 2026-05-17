import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId)))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const { name, type, departmentIds, description } = await request.json();

  const project = await prisma.project.update({
    where: { id: parseInt(id) },
    data: {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(description !== undefined && { description }),
      editedBy: payload.userId,
      editedAt: new Date(),
      version: { increment: 1 },
      ...(departmentIds !== undefined ? {
        departments: {
          deleteMany: {},
          create: departmentIds.map((deptId: number) => ({ departmentId: deptId })),
        },
      } : {}),
    },
  });
  return NextResponse.json({ project });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId)))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  await prisma.project.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
