import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const companies = await prisma.company.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ companies });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload || !(await checkPermission(payload.userId, "system", "admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { name } = await request.json();
  if (!name) return NextResponse.json({ error: "名称必填" }, { status: 400 });
  const c = await prisma.company.create({ data: { name } });
  return NextResponse.json(c);
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload || !(await checkPermission(payload.userId, "system", "admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { oldName, newName } = await request.json();
  if (!oldName || !newName) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  // Delete old, create new (name is PK)
  await prisma.company.delete({ where: { name: oldName } });
  const c = await prisma.company.create({ data: { name: newName } });
  return NextResponse.json(c);
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload || !(await checkPermission(payload.userId, "system", "admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  if (!name) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  await prisma.company.delete({ where: { name } });
  return NextResponse.json({ success: true });
}
