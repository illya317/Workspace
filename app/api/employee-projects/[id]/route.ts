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
  const { role, startDate, endDate } = await request.json();

  const entry = await prisma.employeeProject.update({
    where: { id: parseInt(id) },
    data: {
      ...(role !== undefined && { role }),
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate }),
      editedBy: payload.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  return NextResponse.json({ entry });
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
  await prisma.employeeProject.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
