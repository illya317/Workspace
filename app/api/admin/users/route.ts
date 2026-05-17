import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });

  if (!user?.isWorkListAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ departmentName: "asc" }, { name: "asc" }],
    select: {
      id: true,
      username: true,
      name: true,
      departmentName: true,
      departmentId: true,
      isWorkListAdmin: true,
      canLogin: true,
      canSelectAnyWeek: true,
      canAccessHR: true,
      canAccessWorks: true,
      employeeId: true,
    },
  });

  // 按 employeeId 去重合并（同一人在多岗时可能有多个 User 账号）
  const seenEmployeeIds = new Set<string>();
  const deduped = users.filter((u) => {
    if (!u.employeeId) return true;
    if (seenEmployeeIds.has(u.employeeId)) return false;
    seenEmployeeIds.add(u.employeeId);
    return true;
  });

  return NextResponse.json({ users: deduped });
}
