import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";

const ALLOWED = ["code", "name", "alias", "level", "levelLabel", "parentId", "managerUserId"];

async function resolveDeptId(name: string): Promise<number | null> {
  if (!name) return null;
  const dept = await prisma.department.findFirst({ where: { name }, select: { id: true } });
  return dept?.id ?? null;
}

async function resolveUserId(name: string): Promise<number | null> {
  if (!name) return null;
  const user = await prisma.user.findFirst({ where: { name }, select: { id: true } });
  return user?.id ?? null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const { field, value } = await request.json();

  if (!ALLOWED.includes(field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });



  let finalValue: any = value;
  if (field === "parentId" && typeof value === "string") {
    finalValue = await resolveDeptId(value);
  }
  if (field === "managerUserId" && typeof value === "string") {
    finalValue = await resolveUserId(value);
  }
  if (field === "level") finalValue = value ? parseInt(value) : null;

  await prisma.department.update({
    where: { id: parseInt(id) },
    data: { [field]: finalValue ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("Department", parseInt(id), payload.userId);
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
  await snapshotHistory("Department", parseInt(id), payload.userId);
  await prisma.department.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
