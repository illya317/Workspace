import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";

const ALLOWED = ["parentId", "childId", "shareRatio", "isConsolidated"];

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

  const old = await prisma.companyRelation.findUnique({ where: { id: parseInt(id) } });
  if (old) await snapshotHistory("company_relation", String(id), old, payload.userId);

  const data: any = { [field]: value ?? null };
  if (field === "shareRatio" && value !== null && value !== "") data[field] = parseFloat(value);
  if (field === "parentId" || field === "childId") data[field] = Number(value);

  await prisma.companyRelation.update({ where: { id: parseInt(id) }, data });
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
  await prisma.companyRelation.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
