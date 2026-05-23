import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPharma } from "@/lib/company";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company") || "";

  const where: any = {};
  if (company) where.company = company;

  const depts = await prisma.department.findMany({
    where,
    include: {
      _count: { select: { edps: true } },
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
    },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({
    departments: depts.map((d: any) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      company: isPharma(d.code) ? '丰华制药' : '丰华生物',
      level: d.level,
      parentId: d.parentId,
      parentName: d.parent?.name || null,
      managerUserId: d.managerUserId,
      managerName: d.manager?.name || null,
      headcount: d._count.edps,
      children: (d.children as any[]).map((c: any) => ({ id: c, name: c })),
    })),
  });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { code, name, alias, level, levelLabel, parentId, managerUserId } = body;

  if (!code || !name) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  try {
    const created = await prisma.department.create({
      data: {
        code,
        name,
        alias: alias || null,
        level: level || 1,
        levelLabel: levelLabel || "部门",
        parentId: parentId || null,
        managerUserId: managerUserId || null,
      },
    });
    return NextResponse.json({ success: true, department: created });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "编码已存在" }, { status: 409 });
    }
    throw e;
  }
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { id, code, name, company, level, parentId, managerUserId } = body;

  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  const data: any = {};
  if (code !== undefined) data.code = code;
  if (name !== undefined) data.name = name;
  if (company !== undefined) data.company = company;
  if (level !== undefined) data.level = level;
  if (parentId !== undefined) data.parentId = parentId || null;
  if (managerUserId !== undefined) data.managerUserId = managerUserId || null;

  try {
    const updated = await prisma.department.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, department: updated });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "编码已存在" }, { status: 409 });
    }
    if (e.code === "P2025") {
      return NextResponse.json({ error: "部门不存在" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  try {
    await prisma.department.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e.code === "P2025") {
      return NextResponse.json({ error: "部门不存在" }, { status: 404 });
    }
    if (e.code === "P2003") {
      return NextResponse.json({ error: "该部门下有关联岗位，无法删除" }, { status: 409 });
    }
    throw e;
  }
}
