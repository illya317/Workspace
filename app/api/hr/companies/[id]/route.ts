import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";

const ALLOWED = ["code", "name", "fullName", "registeredCapital", "unifiedCode", "bankName", "registeredAddress", "registeredDate", "legalPerson", "queryGroup", "sortOrder"];

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

  if (!ALLOWED.includes(field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });



  await prisma.company.update({
    where: { id: parseInt(id) },
    data: { [field]: value ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("Company", parseInt(id), payload.userId);
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
  await snapshotHistory("Company", parseInt(id), payload.userId);
  await prisma.companyRelation.deleteMany({ where: { OR: [{ parentId: parseInt(id) }, { childId: parseInt(id) }] } });
  await prisma.company.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
