import { NextResponse } from "next/server";
import { authenticate, isAnyGroupAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);

  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true, canSelectAnyWeek: true, canAccessHR: true, canAccessWorks: true },
  });

  const groupAdmin = await isAnyGroupAdmin(payload.userId);

  return NextResponse.json({
    user: {
      id: payload.userId,
      name: payload.name,
      departmentId: payload.departmentId,
      departmentName: payload.departmentName,
      isWorkListAdmin: user?.isWorkListAdmin ?? false,
      isAnyGroupAdmin: groupAdmin,
      canSelectAnyWeek: user?.canSelectAnyWeek ?? false,
      canAccessHR: user?.canAccessHR ?? false,
      canAccessWorks: user?.canAccessWorks ?? true,
      company: null,
    },
  });
}
