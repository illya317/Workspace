import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { SHARED_GROUP_CODES } from "@/lib/company";

function normalizeCompany(company: string): string {
  if (SHARED_GROUP_CODES.includes(company)) return "01";
  return company;
}

function buildFullCode(code: string, company: string): string {
  const normalized = normalizeCompany(company);
  if (code.length <= 3) {
    return normalized + code.padStart(3, "0");
  }
  return code;
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const companysParam = searchParams.get("companys");
  const company = searchParams.get("company");
  const departmentCode = searchParams.get("departmentCode");
  const positionCode = searchParams.get("positionCode");

  // 查询某个岗位关联的部门
  if (positionCode) {
    const pos = await prisma.position.findFirst({ where: { code: positionCode } });
    if (!pos) return NextResponse.json({ departments: [] });
    const dept = pos.departmentId
      ? await prisma.department.findUnique({ where: { id: pos.departmentId }, select: { name: true } })
      : null;
    return NextResponse.json({ departments: dept ? [dept.name] : [] });
  }

  const codes = companysParam
    ? companysParam.split(",")
    : company
      ? [company]
      : [];

  // 如果指定了部门编码，查该部门下的岗位
  let positionIds: number[] | undefined;
  if (departmentCode) {
    const dept = await prisma.department.findFirst({ where: { code: departmentCode } });
    if (dept) {
      const positions = await prisma.position.findMany({
        where: { departmentId: dept.id },
        select: { id: true },
      });
      positionIds = positions.map(p => p.id);
    }
    if (!positionIds || positionIds.length === 0) {
      return NextResponse.json({ codes: [] });
    }
  }

  const where: Prisma.PositionWhereInput = {};
  if (codes.length > 0) {
    where.OR = codes.map((cc: string) => ({ code: { startsWith: cc } }));
  }
  if (positionIds) {
    where.id = { in: positionIds };
  }
  const result = await prisma.position.findMany({ where, orderBy: { code: "asc" } });
  const filtered = result.filter((r) => /^\d{5}$/.test(r.code));
  return NextResponse.json({ codes: filtered.map((r) => ({ code: r.code, name: r.name })) });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const body = await request.json();
  const { code, name, company, originalCode, departmentCode } = body;
  if (!code || !name) return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  const finalCode = buildFullCode(code, company || "");

  const result = await prisma.$transaction(async (tx) => {
    if (originalCode && originalCode !== finalCode) {
      const existing = await tx.position.findFirst({ where: { code: finalCode } });
      if (existing) throw new Error("编号已存在");
      const oldPos = await tx.position.findFirst({ where: { code: originalCode } });
      if (oldPos) {
        const maxVer = await tx.editHistory.findFirst({
          where: { entityType: "Position", entityId: originalCode },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        await tx.editHistory.create({
          data: {
            entityType: "Position",
            entityId: originalCode,
            version: (maxVer?.version || 0) + 1,
            dataJson: JSON.stringify(oldPos),
            editedBy: payload.userId,
          },
        });
      }
      await tx.position.update({
        where: { code: originalCode } as unknown as Prisma.PositionWhereUniqueInput,
        data: { code: finalCode, name, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
      });
    } else {
      const oldPos = await tx.position.findFirst({ where: { code: finalCode } });
      if (oldPos) {
        const maxVer = await tx.editHistory.findFirst({
          where: { entityType: "Position", entityId: finalCode },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        await tx.editHistory.create({
          data: {
            entityType: "Position",
            entityId: finalCode,
            version: (maxVer?.version || 0) + 1,
            dataJson: JSON.stringify(oldPos),
            editedBy: payload.userId,
          },
        });
      }
      const data: Prisma.PositionUpdateInput = { name, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } };
      const create: Prisma.PositionCreateInput = { code: finalCode, name };
      if (departmentCode) {
        const dept = await tx.department.findFirst({ where: { code: departmentCode } });
        if (dept) { data.department = { connect: { id: dept.id } }; create.department = { connect: { id: dept.id } }; }
      }
      await tx.position.upsert({
        where: { code: finalCode } as unknown as Prisma.PositionWhereUniqueInput,
        update: data,
        create,
      });
    }
    return { success: true };
  });
  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ error: "缺少code" }, { status: 400 });
  const pos = await prisma.position.findFirst({ where: { code } });
  if (!pos) return NextResponse.json({ error: "岗位不存在" }, { status: 404 });
  const epCount = await prisma.eDP.count({ where: { positionId: pos.id } });
  if (epCount > 0) {
    return NextResponse.json({ error: `该岗位下有 ${epCount} 名员工，无法删除` }, { status: 400 });
  }
  await prisma.position.delete({ where: { id: pos.id } });
  return NextResponse.json({ success: true });
}
