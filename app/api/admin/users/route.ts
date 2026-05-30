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
      canLogin: true,
    },
  });

  // 从 Employee.userId 反查关联员工（保证一致性）
  const userIds = users.map((u) => u.id);
  const employees = await prisma.employee.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, name: true, employeeId: true },
  });
  const empByUser: Record<number, { name: string; employeeId: string }> = {};
  for (const e of employees) empByUser[e.userId!] = { name: e.name, employeeId: e.employeeId };

  const enrichedUsers = await Promise.all(
    users.map(async (u) => {
      const [isAdmin, canAccessHR, canEditHR, canDeleteHR, canAccessWorks, canAccessFinance, canAccessInventory, canAccessContract, canAccessDocs] = await Promise.all([
        checkPermission(u.id, "system", "admin"),
        checkPermission(u.id, "people", "access"),
        checkPermission(u.id, "people", "write"),
        checkPermission(u.id, "people", "delete"),
        checkPermission(u.id, "work", "access"),
        checkPermission(u.id, "finance", "access"),
        checkPermission(u.id, "inventory", "access"),
        checkPermission(u.id, "administration.contract", "access"),
        checkPermission(u.id, "docs", "access"),
      ]);
      return {
        id: u.id,
        username: u.username,
        name: empByUser[u.id]?.name || u.name,
        employeeId: empByUser[u.id]?.employeeId || null,
        canLogin: u.canLogin,
        isWorkListAdmin: isAdmin,
        canAccessHR: isAdmin || canAccessHR || canEditHR || canDeleteHR,
        canEditHR: isAdmin || canEditHR,
        canDeleteHR: isAdmin || canDeleteHR,
        canAccessWorks: isAdmin || canAccessWorks,
        canAccessFinance: isAdmin || canAccessFinance,
        canAccessInventory: isAdmin || canAccessInventory,
        canAccessContract: isAdmin || canAccessContract,
        canAccessDocs: isAdmin || canAccessDocs,
      };
    })
  );

  return NextResponse.json({ users: enrichedUsers });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkPermission(payload.userId, "system", "admin"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json();
  const { name, username } = body;
  if (!name) return NextResponse.json({ error: "姓名为必填" }, { status: 400 });

  const user = await prisma.user.create({
    data: { name, username: username || null, canLogin: true },
  });
  return NextResponse.json({ user });
}
