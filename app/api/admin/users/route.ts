import { NextResponse } from "next/server";
import { authenticate, checkPermission, getPermissionContext } from "@/lib/auth";
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

  // Employee-user mapping
  const employees = await prisma.employee.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { userId: true, name: true, employeeId: true },
  });
  const empByUser: Record<number, { name: string; employeeId: string }> = {};
  for (const e of employees) empByUser[e.userId!] = { name: e.name, employeeId: e.employeeId };

  // Use the same visibility engine as module-nav and page gates.
  const { getVisibleResourceKeys } = await import("@/server/rbac/visibility");
  const { ensureGrantCache } = await import("@/server/rbac/context");

  const enrichedUsers = await Promise.all(users.map(async (u) => {
    const ctx = await getPermissionContext(u.id);
    await ensureGrantCache(ctx); // preload → fast in-memory path
    const [visibleAccess, visibleWrite] = await Promise.all([
      getVisibleResourceKeys(ctx, "access"),
      getVisibleResourceKeys(ctx, "write"),
    ]);

    const isAdmin = ctx.isAdmin;
    const resourceRoles: Array<{ resourceKey: string; roleKey: string }> = [];
    for (const key of visibleAccess) {
      resourceRoles.push({
        resourceKey: key,
        roleKey: visibleWrite.has(key) ? "write" : "access",
      });
    }

    return {
      id: u.id,
      username: u.username,
      name: empByUser[u.id]?.name || u.name,
      employeeId: empByUser[u.id]?.employeeId || null,
      canLogin: u.canLogin,
      isWorkListAdmin: isAdmin,
      resourceRoles,
    };
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
