import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isWorkListAdmin: true },
  });
  return user?.isWorkListAdmin === true;
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId");

  const where: any = {};
  if (employeeId) where.employeeId = parseInt(employeeId);

  const eps = await prisma.employeePosition.findMany({
    where,
    include: {
      employee: { select: { id: true, employeeId: true, name: true } },
      department: { select: { id: true, code: true, name: true, company: true } },
      position: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ employeeId: "asc" }, { sortOrder: "asc" }],
  });

  return NextResponse.json({
    employeePositions: eps.map((ep) => ({
      id: ep.id,
      employeeId: ep.employeeId,
      employeeName: ep.employee?.name,
      employeeCode: ep.employee?.employeeId,
      departmentId: ep.departmentId,
      departmentName: ep.department?.name,
      departmentCode: ep.department?.code,
      departmentCompany: ep.department?.company,
      positionId: ep.positionId,
      positionName: ep.position?.name,
      positionCode: ep.position?.code,
      center: ep.center,
      isPrimary: ep.isPrimary,
      sortOrder: ep.sortOrder,
    })),
  });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await requireAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { employeeId, departmentId, positionId, center, isPrimary } = body;

  if (!employeeId || !departmentId || !positionId) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  try {
    const created = await prisma.employeePosition.create({
      data: {
        employeeId: parseInt(employeeId),
        departmentId: parseInt(departmentId),
        positionId: parseInt(positionId),
        center: center || null,
        isPrimary: isPrimary || false,
      },
    });
    return NextResponse.json({ success: true, employeePosition: created });
  } catch (e: any) {
    if (e.code === "P2003") {
      return NextResponse.json({ error: "员工、部门或岗位不存在" }, { status: 400 });
    }
    throw e;
  }
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await requireAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { id, departmentId, positionId, center, isPrimary, sortOrder } = body;

  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  const data: any = {};
  if (departmentId !== undefined) data.departmentId = parseInt(departmentId);
  if (positionId !== undefined) data.positionId = parseInt(positionId);
  if (center !== undefined) data.center = center || null;
  if (isPrimary !== undefined) data.isPrimary = isPrimary;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  try {
    const updated = await prisma.employeePosition.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, employeePosition: updated });
  } catch (e: any) {
    if (e.code === "P2025") {
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await requireAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  try {
    await prisma.employeePosition.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e.code === "P2025") {
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }
    throw e;
  }
}
