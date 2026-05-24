import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);

  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userWithPerms = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, username: true, wxUserId: true, apiKey: true, canLogin: true },
  });

  if (!userWithPerms) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  // 找该用户对应的员工信息 + 在职状态
  const employee = await prisma.employee.findFirst({
    where: { userId: payload.userId },
    select: {
      employeeId: true,
      employments: { select: { isActive: true }, orderBy: { id: "desc" }, take: 1 },
    },
  });
  const isActiveEmployee = employee?.employments?.[0]?.isActive ?? false;

  const [isAdmin, canAnyWeek, hasHR, hasWorks, hasFinance] = await Promise.all([
    checkPermission(payload.userId, "system", "admin"),
    checkPermission(payload.userId, "work.report", "write"),
    checkPermission(payload.userId, "people", "access"),
    checkPermission(payload.userId, "work", "access"),
    checkPermission(payload.userId, "finance", "access"),
  ]);

  return NextResponse.json({
    user: {
      ...userWithPerms,
      isWorkListAdmin: isAdmin,
      isSuperAdmin: isAdmin,
      canSelectAnyWeek: canAnyWeek,
      canAccessHR: isAdmin || (hasHR && isActiveEmployee),
      canAccessWorks: hasWorks,
      canAccessFinance: hasFinance,
      canAccessAdmin: isAdmin || (hasHR && isActiveEmployee),
      employeeId: employee?.employeeId ?? null,
      isActiveEmployee,
    },
  });
}