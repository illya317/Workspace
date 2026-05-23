import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";

const ALLOWED = [
  "departmentId", "positionId", "isPrimary", "startDate", "endDate",
  "personnelType", "rank", "title", "reportTo", "reportTo2", "workPercent", "isResearch",
];

async function resolveDeptId(name: string): Promise<number | null> {
  if (!name) return null;
  const dept = await prisma.department.findFirst({ where: { name }, select: { id: true } });
  return dept?.id ?? null;
}

async function resolvePositionId(name: string): Promise<number | null> {
  if (!name) return null;
  const pos = await prisma.position.findFirst({ where: { name }, select: { id: true } });
  return pos?.id ?? null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { field, value } = body as { field: string; value: string | boolean | null };

  // 兼容旧字段名
  if (field === "dept1") {
    const deptName = String(value || "");
    const dept = deptName ? await prisma.department.findFirst({ where: { name: deptName } }) : null;
    if (deptName && !dept) return NextResponse.json({ error: `部门"${deptName}"不存在` }, { status: 400 });
    await prisma.eDP.update({
      where: { id: parseInt(id) },
      data: { departmentId: dept?.id ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
    });
    await snapshotHistory("EDP", parseInt(id), payload.userId);
    return NextResponse.json({ success: true });
  }

  if (field === "position") {
    const posName = String(value || "");
    const pos = posName ? await prisma.position.findFirst({ where: { name: posName } }) : null;
    if (posName && !pos) return NextResponse.json({ error: `岗位"${posName}"不存在` }, { status: 400 });
    await prisma.eDP.update({
      where: { id: parseInt(id) },
      data: { positionId: pos?.id ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
    });
    await snapshotHistory("EDP", parseInt(id), payload.userId);
    return NextResponse.json({ success: true });
  }

  if (!ALLOWED.includes(field)) {
    return NextResponse.json({ error: "非法字段" }, { status: 400 });
  }



  let finalValue: any = value;
  if (field === "departmentId" && typeof value === "string") {
    finalValue = await resolveDeptId(value);
  }
  if (field === "positionId" && typeof value === "string") {
    finalValue = await resolvePositionId(value);
  }

  await prisma.eDP.update({
    where: { id: parseInt(id) },
    data: { [field]: finalValue ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("EDP", parseInt(id), payload.userId);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  await snapshotHistory("EDP", parseInt(id), payload.userId);
  await prisma.eDP.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
