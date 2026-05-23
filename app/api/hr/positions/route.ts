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

  const positions = await prisma.position.findMany({
    where,
    include: {
      _count: { select: { edps: true } },
      department: { select: { id: true, name: true } },
      positionDescription: { select: { id: true, name: true } },
    },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({
    positions: positions.map((p: any) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      company: isPharma(p.code) ? '丰华制药' : '丰华生物',
      departmentId: p.departmentId,
      departmentName: p.department?.name || null,
      positionDescriptionId: p.positionDescriptionId,
      positionDescriptionName: p.positionDescription?.name || null,
      headcount: p._count.edps,
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
  const { code, name, alias, departmentId, positionDescriptionId } = body;

  if (!code || !name) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  try {
    const created = await prisma.position.create({
      data: {
        code,
        name,
        alias: alias || null,
        departmentId: departmentId || null,
        positionDescriptionId: positionDescriptionId || null,
      },
    });
    return NextResponse.json({ success: true, position: created });
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
  const { id, code, name, company } = body;

  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  const data: any = {};
  if (code !== undefined) data.code = code;
  if (name !== undefined) data.name = name;
  if (company !== undefined) data.company = company;

  try {
    const updated = await prisma.position.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, position: updated });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "编码已存在" }, { status: 409 });
    }
    if (e.code === "P2025") {
      return NextResponse.json({ error: "岗位不存在" }, { status: 404 });
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
    await prisma.position.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e.code === "P2025") {
      return NextResponse.json({ error: "岗位不存在" }, { status: 404 });
    }
    if (e.code === "P2003") {
      return NextResponse.json({ error: "该岗位下有关联员工，无法删除" }, { status: 409 });
    }
    throw e;
  }
}
