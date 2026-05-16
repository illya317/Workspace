import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const admin = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true },
  });

  if (!admin?.isWorkListAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, field, value } = body;

  if (!userId || !field || typeof value !== "boolean") {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const allowedFields = [
    "isWorkListAdmin",
    "canSelectAnyWeek",
    "canAccessHR",
    "canAccessWorks",
    "canLogin",
  ];

  if (!allowedFields.includes(field)) {
    return NextResponse.json({ error: "无效的权限字段" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { [field]: value },
  });

  return NextResponse.json({ success: true, user: updated });
}
