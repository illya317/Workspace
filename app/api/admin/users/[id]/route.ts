import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isWorkListAdmin: true },
  });
  return user?.isWorkListAdmin === true;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await requireAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { canSelectAnyWeek, canAccessHR, canAccessWorks, isWorkListAdmin } = body;

  const updateData: Record<string, any> = {};
  if (canSelectAnyWeek !== undefined) updateData.canSelectAnyWeek = canSelectAnyWeek;
  if (canAccessHR !== undefined) updateData.canAccessHR = canAccessHR;
  if (canAccessWorks !== undefined) updateData.canAccessWorks = canAccessWorks;
  if (isWorkListAdmin !== undefined) updateData.isWorkListAdmin = isWorkListAdmin;

  const targetUser = await prisma.user.findUnique({
    where: { id: parseInt(id) },
    select: { employeeId: true },
  });

  if (targetUser?.employeeId) {
    // 同步更新所有同 employeeId 的 User，保持权限一致
    await prisma.user.updateMany({
      where: { employeeId: targetUser.employeeId },
      data: updateData,
    });
  } else {
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
    });
  }

  return NextResponse.json({ success: true });
}

function randomPassword(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await requireAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const newPassword = randomPassword(10);

  await prisma.user.update({
    where: { id: parseInt(id) },
    data: { password: newPassword },
  });

  return NextResponse.json({ success: true, password: newPassword });
}
