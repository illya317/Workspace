import { NextResponse } from "next/server";
import { authenticate, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadCompanyMap, resolveCompanyCode } from "@/server/services/hr/company-directory";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const [depts, companyMap] = await Promise.all([
    prisma.department.findMany({
      where: { level: 2 },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    loadCompanyMap(),
  ]);

  const results = depts.map((d) => {
    const companyCode = resolveCompanyCode(companyMap, d.code);
    const c = companyMap.get(companyCode) as { name?: string; managementGroup?: string } | undefined;
    return {
      id: d.id,
      name: d.name,
      managementGroup: c?.managementGroup ?? "常规体系",
      company: c?.name ?? d.code,
      count: 0,
    };
  });

  return NextResponse.json({ departments: results });
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { departmentId } = body;

  if (!departmentId) {
    return NextResponse.json({ error: "缺少 departmentId" }, { status: 400 });
  }

  try {
    await prisma.department.delete({
      where: { id: departmentId },
    });
    return NextResponse.json({ success: true, message: "部门已删除" });
  } catch {
    return NextResponse.json({ error: "删除失败，部门可能不存在或有关联数据" }, { status: 400 });
  }
}
