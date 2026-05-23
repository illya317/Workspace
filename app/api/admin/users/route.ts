import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await checkPermission(payload.userId, "system", "admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      username: true,
      name: true,
      employeeId: true,
      canLogin: true,
      resourceRoles: {
        include: {
          resource: { select: { key: true, name: true } },
          role: { select: { key: true, name: true } },
        },
      },
    },
  });

  // Compute backward-compat boolean fields from resourceRoles
  const enrichedUsers = users.map((u) => ({
    ...u,
    isWorkListAdmin: u.resourceRoles.some(
      (rr) => rr.resource.key === "system" && rr.role.key === "admin"
    ),
    canAccessHR: u.resourceRoles.some(
      (rr) => rr.resource.key === "people" && rr.role.key === "access"
    ),
    canAccessWorks: u.resourceRoles.some(
      (rr) => rr.resource.key === "work" && rr.role.key === "access"
    ),
  }));

  return NextResponse.json({ users: enrichedUsers });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkPermission(payload.userId, "system", "admin"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json();
  const { name, username, employeeId } = body;
  if (!name) return NextResponse.json({ error: "姓名为必填" }, { status: 400 });

  const user = await prisma.user.create({
    data: { name, username: username || null, employeeId: employeeId || null, canLogin: true },
  });
  return NextResponse.json({ user });
}
