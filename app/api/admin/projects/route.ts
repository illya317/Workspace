import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const isSysAdmin = await checkPermission(payload.userId, "system", "admin");
  if (!isSysAdmin) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ projects });
}
