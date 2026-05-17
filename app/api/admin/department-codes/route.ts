import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SHARED_GROUP_CODES, getCompanyFromCode } from "@/lib/company";

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

  const codes = companysParam
    ? companysParam.split(",")
    : company
      ? [company]
      : [];

  const where: any = {};
  if (codes.length > 0) {
    where.OR = codes.map((cc: string) => ({ code: { startsWith: cc } }));
  }

  const result = await prisma.department.findMany({ where, orderBy: { code: "asc" } });
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
  const { code, name, company, originalCode } = body;
  if (!code || !name) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  const finalCode = buildFullCode(code, company || "");

  if (originalCode && originalCode !== finalCode) {
    const existing = await prisma.department.findUnique({ where: { code: finalCode } });
    if (existing) {
      return NextResponse.json({ error: "编号已存在" }, { status: 400 });
    }
    // 快照旧数据
    const oldDept = await prisma.department.findUnique({ where: { code: originalCode } });
    if (oldDept) {
      const entityId = originalCode;
      const maxVer = await prisma.editHistory.findFirst({
        where: { entityType: "code_department", entityId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      await prisma.editHistory.create({
        data: {
          entityType: "code_department",
          entityId,
          version: (maxVer?.version || 0) + 1,
          dataJson: JSON.stringify(oldDept),
          editedBy: payload.userId,
        },
      });
    }
    await prisma.department.update({
      where: { code: originalCode },
      data: { code: finalCode, name, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
    });
  } else {
    const oldDept = await prisma.department.findUnique({ where: { code: finalCode } });
    if (oldDept) {
      const maxVer = await prisma.editHistory.findFirst({
        where: { entityType: "code_department", entityId: finalCode },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      await prisma.editHistory.create({
        data: {
          entityType: "code_department",
          entityId: finalCode,
          version: (maxVer?.version || 0) + 1,
          dataJson: JSON.stringify(oldDept),
          editedBy: payload.userId,
        },
      });
    }
    await prisma.department.upsert({
      where: { code: finalCode },
      update: { name, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
      create: { code: finalCode, name, company: getCompanyFromCode(finalCode), level: 1 },
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
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ error: "缺少code" }, { status: 400 });

  const dept = await prisma.department.findUnique({ where: { code } });
  if (!dept) return NextResponse.json({ error: "部门不存在" }, { status: 404 });

  const epCount = await prisma.employeePosition.count({ where: { departmentId: dept.id } });
  if (epCount > 0) {
    return NextResponse.json(
      { error: `该部门下有 ${epCount} 名员工，无法删除` },
      { status: 400 }
    );
  }

  await prisma.department.delete({ where: { code } });
  return NextResponse.json({ success: true });
}
