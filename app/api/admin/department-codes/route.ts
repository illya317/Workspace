import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCodePoolCode } from "@workspace/hr/server/company-directory";

async function buildFullCode(code: string, company: string): Promise<string> {
  const normalized = await getCodePoolCode(company);
  if (code.length <= 3) return normalized + code.padStart(3, "0");
  return code;
}

async function snapshotDept(code: string, editorId: number) {
  const dept = await prisma.department.findFirst({ where: { code } });
  if (!dept) return;
  const maxVer = await prisma.editHistory.findFirst({ where: { entityType: "Department", entityId: code }, orderBy: { version: "desc" }, select: { version: true } });
  await prisma.editHistory.create({ data: { entityType: "Department", entityId: code, version: (maxVer?.version || 0) + 1, dataJson: JSON.stringify(dept), editedBy: editorId } });
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) {
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

  const where: Prisma.DepartmentWhereInput = {};
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
  if (!(await checkHRWrite(payload.userId, "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { code, name, company, originalCode } = body;
  if (!code || !name) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  const finalCode = await buildFullCode(code, company || "");

  if (originalCode && originalCode !== finalCode) {
    const existing = await prisma.department.findFirst({ where: { code: finalCode } });
    if (existing) return NextResponse.json({ error: "编号已存在" }, { status: 400 });
    const oldDept = await prisma.department.findFirst({ where: { code: originalCode } });
    if (oldDept) {
      await snapshotDept(originalCode, payload.userId);
      await prisma.department.update({
        where: { id: oldDept.id },
        data: { code: finalCode, name, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
      });
    }
  } else {
    const oldDept = await prisma.department.findFirst({ where: { code: finalCode } });
    if (oldDept) {
      await snapshotDept(finalCode, payload.userId);
      await prisma.department.update({
        where: { id: oldDept.id },
        data: { name, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
      });
    } else {
      await prisma.department.create({ data: { code: finalCode, name, level: 1 } });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRDelete(payload.userId, "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ error: "缺少code" }, { status: 400 });

  const dept = await prisma.department.findFirst({ where: { code } });
  if (!dept) return NextResponse.json({ error: "部门不存在" }, { status: 404 });

  const epCount = await prisma.eDP.count({ where: { departmentId: dept.id } });
  if (epCount > 0) {
    return NextResponse.json({ error: `该部门下有 ${epCount} 名员工，无法删除` }, { status: 400 });
  }

  await prisma.department.delete({ where: { id: dept.id } });
  return NextResponse.json({ success: true });
}
