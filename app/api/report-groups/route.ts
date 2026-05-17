import { NextResponse } from "next/server";
import { authenticate, requireAdmin, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let groups;
  if (await checkPermission(payload.userId, "system", "admin")) {
    groups = await prisma.reportGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        department: { select: { id: true, name: true, companyCode: true } },
        _count: { select: { reports: true } },
      },
    });
  } else {
    // 周报管理员：只返回自己管理的
    const adminGrants = await prisma.userResourceRole.findMany({
      where: {
        userId: payload.userId,
        resource: { key: "work.report" },
        role: { key: "admin" },
      },
      select: { scopeId: true },
    });
    const groupIds = adminGrants.map((a) => parseInt(a.scopeId!)).filter((n) => !isNaN(n) && n > 0);
    if (groupIds.length === 0) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    groups = await prisma.reportGroup.findMany({
      where: { id: { in: groupIds } },
      orderBy: { sortOrder: "asc" },
      include: {
        department: { select: { id: true, name: true, companyCode: true } },
        _count: { select: { reports: true } },
      },
    });
  }

  // Compute member/viewer counts from UserResourceRole (old _count fields)
  const groupIdStrs = groups.map((g: { id: number }) => String(g.id));
  if (groupIdStrs.length > 0) {
    const roleGrants = await prisma.userResourceRole.findMany({
      where: {
        resource: { key: "work.report" },
        scopeId: { in: groupIdStrs },
      },
      select: { scopeId: true, role: { select: { key: true } } },
    });

    const memberCounts = new Map<string, number>();
    const viewerCounts = new Map<string, number>();
    for (const g of roleGrants) {
      if (g.role.key === "member") {
        memberCounts.set(g.scopeId!, (memberCounts.get(g.scopeId!) || 0) + 1);
      }
      if (g.role.key === "viewer") {
        viewerCounts.set(g.scopeId!, (viewerCounts.get(g.scopeId!) || 0) + 1);
      }
    }

    groups = groups.map((g: any) => ({
      ...g,
      _count: {
        ...(g._count || {}),
        members: memberCounts.get(String(g.id)) || 0,
        viewers: viewerCounts.get(String(g.id)) || 0,
      },
    }));
  }

  // Normalize department.companyCode -> company for backward compat
  groups = groups.map((g: any) => ({
    ...g,
    department: g.department
      ? { ...g.department, company: g.department.companyCode || "" }
      : null,
  }));

  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const { error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { name, description, sortOrder, departmentId } = body;

  if (!name) {
    return NextResponse.json({ error: "名称不能为空" }, { status: 400 });
  }

  const group = await prisma.reportGroup.create({
    data: {
      name,
      description: description || null,
      sortOrder: sortOrder ?? 0,
      departmentId: departmentId || null,
    },
  });

  return NextResponse.json({ group });
}
