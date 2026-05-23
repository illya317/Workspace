import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkPermission(payload.userId, "system", "admin"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

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

  // Resolve employee names from Employee table
  const empIds = [...new Set(users.map((u) => u.employeeId).filter(Boolean))];
  const employees = await prisma.employee.findMany({
    where: { employeeId: { in: empIds as string[] } },
    select: { employeeId: true, name: true },
  });
  const empNameMap: Record<string, string> = {};
  for (const e of employees) empNameMap[e.employeeId] = e.name;

  const enrichedUsers = users.map((u) => ({
    id: u.id,
    username: u.username,
    name: empNameMap[u.employeeId!] || u.name, // 优先显示 Employee 姓名
    employeeId: u.employeeId,
    canLogin: u.canLogin,
    isWorkListAdmin: u.resourceRoles.some((rr) => rr.resource.key === "system" && rr.role.key === "admin"),
    canAccessHR: u.resourceRoles.some((rr) => rr.resource.key === "people" && rr.role.key === "access"),
    canAccessWorks: u.resourceRoles.some((rr) => rr.resource.key === "work" && rr.role.key === "access"),
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
