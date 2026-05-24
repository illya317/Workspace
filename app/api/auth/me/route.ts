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
      isWorkListAdmin: isAdmin,      // keep old key
      isSuperAdmin: isAdmin,         // new key
      canSelectAnyWeek: canAnyWeek,
      canAccessHR: hasHR,
      canAccessWorks: hasWorks,
      canAccessFinance: hasFinance,
      employeeId: null,
    },
  });
}