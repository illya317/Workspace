import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkPermission(payload.userId, "system", "admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: { id: true, username: true, name: true, canLogin: true },
  });

  const userIds = users.map((u) => u.id);

  // Employee-user mapping
  const employees = await prisma.employee.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, name: true, employeeId: true },
  });
  const empByUser: Record<number, { name: string; employeeId: string }> = {};
  for (const e of employees) empByUser[e.userId!] = { name: e.name, employeeId: e.employeeId };

  // Batch query all UserResourceRole grants
  const allGrants = await prisma.userResourceRole.findMany({
    where: { userId: { in: userIds } },
    include: { resource: { select: { key: true } }, role: { select: { key: true } } },
  });

  // Group grants by userId (ignore scopeId for summary display)
  const grantsByUser: Record<number, Array<{ resourceKey: string; roleKey: string }>> = {};
  for (const g of allGrants) {
    if (!grantsByUser[g.userId]) grantsByUser[g.userId] = [];
    grantsByUser[g.userId].push({ resourceKey: g.resource.key, roleKey: g.role.key });
  }

  // system.admin check (for "管理员" badge)
  const adminIds = new Set<number>();
  for (const u of users) {
    // Check direct system.admin grant only
    const hasAdmin = grantsByUser[u.id]?.some(
      (g) => g.resourceKey === "system" && g.roleKey === "admin"
    );
    if (hasAdmin) adminIds.add(u.id);
  }

  const enrichedUsers = users.map((u) => ({
    id: u.id,
    username: u.username,
    name: empByUser[u.id]?.name || u.name,
    employeeId: empByUser[u.id]?.employeeId || null,
    canLogin: u.canLogin,
    isWorkListAdmin: adminIds.has(u.id),
    resourceRoles: grantsByUser[u.id] || [],
  }));

  return NextResponse.json({ users: enrichedUsers });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkPermission(payload.userId, "system", "admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { name, username } = body;
  if (!name) return NextResponse.json({ error: "姓名为必填" }, { status: 400 });

  const user = await prisma.user.create({
    data: { name, username: username || null, canLogin: true },
  });
  return NextResponse.json({ user });
}
