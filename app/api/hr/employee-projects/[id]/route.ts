import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";

const ALLOWED = ["employeeId", "projectId", "role", "startDate", "endDate"];

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  // 兼容旧格式 {role, startDate, endDate}
  if (body.field === undefined) {
    const { role, startDate, endDate } = body;
    const old = await prisma.employeeProject.findUnique({ where: { id: parseInt(id) } });
    if (old) await snapshotHistory("employee_project", String(id), old, payload.userId);
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

  // 新格式 {field, value}
  const { field, value } = body;
  if (!ALLOWED.includes(field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });

  const old = await prisma.employeeProject.findUnique({ where: { id: parseInt(id) } });
  if (old) await snapshotHistory("employee_project", String(id), old, payload.userId);

  let finalValue: any = value;
  if (field === "employeeId" && typeof value === "string") {
    const emp = await prisma.employee.findFirst({ where: { OR: [{ name: value }, { employeeId: value }] }, select: { id: true } });
    finalValue = emp?.id ?? null;
  }
  if (field === "projectId" && typeof value === "string") {
    const proj = await prisma.project.findFirst({ where: { name: value }, select: { id: true } });
    finalValue = proj?.id ?? null;
  }

  await prisma.employeeProject.update({
    where: { id: parseInt(id) },
    data: { [field]: finalValue ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  await prisma.employeeProject.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
