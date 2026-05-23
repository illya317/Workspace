import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";

const ALLOWED = ["employeeId", "isActive", "currentCompany", "joinDate", "leaveDate", "leaveReason", "officeLocation", "attendanceType", "contracts"];

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { field, value } = body;

  if (!ALLOWED.includes(field)) {
    return NextResponse.json({ error: "非法字段" }, { status: 400 });
  }



  let finalValue: any = value;
  if (field === "employeeId" && typeof value === "string") {
    const emp = await prisma.employee.findFirst({ where: { OR: [{ name: value }, { employeeId: value }] }, select: { id: true } });
    finalValue = emp?.id ?? null;
  }

  await prisma.employment.update({
    where: { id: parseInt(id) },
    data: { [field]: finalValue ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("Employment", parseInt(id), payload.userId);

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
  await snapshotHistory("Employment", parseInt(id), payload.userId);
  await prisma.employment.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
