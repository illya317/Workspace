import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const codes = await prisma.company.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ codes: codes.map((r) => ({ id: r.id, code: r.code, name: r.name, parentId: r.parentId })) });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { code, name, parentId, id } = body;
  if (!code || !name) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  if (id) {
    // Update existing
    const existing = await prisma.company.findFirst({ where: { code, parentId: parentId ?? null } });
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "同级别下编码已存在" }, { status: 400 });
    }
    const old = await prisma.company.findUnique({ where: { id } });
    if (old) {
      const maxVer = await prisma.editHistory.findFirst({
        where: { entityType: "code_company", entityId: String(id) },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      await prisma.editHistory.create({
        data: {
          entityType: "code_company",
          entityId: String(id),
          version: (maxVer?.version || 0) + 1,
          dataJson: JSON.stringify(old),
          editedBy: payload.userId,
        },
      });
    }
    await prisma.company.update({
      where: { id },
      data: { code, name, parentId: parentId ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
    });
  } else {
    // Create new
    const existing = await prisma.company.findFirst({ where: { code, parentId: parentId ?? null } });
    if (existing) {
      return NextResponse.json({ error: "同级别下编码已存在" }, { status: 400 });
    }
    await prisma.company.create({
      data: { code, name, parentId: parentId ?? null, sortOrder: 0 },
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");
  if (!idParam) return NextResponse.json({ error: "缺少id" }, { status: 400 });
  const id = parseInt(idParam);

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });

  await prisma.company.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
