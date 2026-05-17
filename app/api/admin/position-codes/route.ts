import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SHARED_GROUP_CODES, getCompanyFromCode } from "@/lib/company";

function normalizeCompanyCode(companyCode: string): string {
  if (SHARED_GROUP_CODES.includes(companyCode)) return "01";
  return companyCode;
}

function buildFullCode(code: string, companyCode: string): string {
  const normalized = normalizeCompanyCode(companyCode);
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
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true, canAccessHR: true },
  });
  if (!user?.canAccessHR && !user?.isWorkListAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const companyCodesParam = searchParams.get("companyCodes");
  const companyCode = searchParams.get("companyCode");

  const codes = companyCodesParam
    ? companyCodesParam.split(",")
    : companyCode
      ? [companyCode]
      : [];

  const where: any = {};
  if (codes.length > 0) {
    where.OR = codes.map((cc: string) => ({ code: { startsWith: cc } }));
  }

  const result = await prisma.position.findMany({ where, orderBy: { code: "asc" } });
  const filtered = result.filter((r) => /^\d{5}$/.test(r.code));
  return NextResponse.json({ codes: filtered.map((r) => ({ code: r.code, name: r.name })) });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true, canAccessHR: true },
  });
  if (!user?.canAccessHR && !user?.isWorkListAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { code, name, companyCode, originalCode } = body;
  if (!code || !name) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  const finalCode = buildFullCode(code, companyCode || "");

  if (originalCode && originalCode !== finalCode) {
    const existing = await prisma.position.findUnique({ where: { code: finalCode } });
    if (existing) {
      return NextResponse.json({ error: "编号已存在" }, { status: 400 });
    }
    const oldPos = await prisma.position.findUnique({ where: { code: originalCode } });
    if (oldPos) {
      const maxVer = await prisma.editHistory.findFirst({
        where: { entityType: "code_position", entityId: originalCode },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      await prisma.editHistory.create({
        data: {
          entityType: "code_position",
          entityId: originalCode,
          version: (maxVer?.version || 0) + 1,
          dataJson: JSON.stringify(oldPos),
          editedBy: payload.userId,
        },
      });
    }
    await prisma.position.update({
      where: { code: originalCode },
      data: { code: finalCode, name, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
    });
  } else {
    const oldPos = await prisma.position.findUnique({ where: { code: finalCode } });
    if (oldPos) {
      const maxVer = await prisma.editHistory.findFirst({
        where: { entityType: "code_position", entityId: finalCode },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      await prisma.editHistory.create({
        data: {
          entityType: "code_position",
          entityId: finalCode,
          version: (maxVer?.version || 0) + 1,
          dataJson: JSON.stringify(oldPos),
          editedBy: payload.userId,
        },
      });
    }
    await prisma.position.upsert({
      where: { code: finalCode },
      update: { name, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
      create: { code: finalCode, name, companyCode: getCompanyFromCode(finalCode) },
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true, canAccessHR: true },
  });
  if (!user?.canAccessHR && !user?.isWorkListAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ error: "缺少code" }, { status: 400 });

  const pos = await prisma.position.findUnique({ where: { code } });
  if (!pos) return NextResponse.json({ error: "岗位不存在" }, { status: 404 });

  const epCount = await prisma.employeePosition.count({ where: { positionId: pos.id } });
  if (epCount > 0) {
    return NextResponse.json(
      { error: `该岗位下有 ${epCount} 名员工，无法删除` },
      { status: 400 }
    );
  }

  await prisma.position.delete({ where: { code } });
  return NextResponse.json({ success: true });
}
