import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const relations = await prisma.companyRelation.findMany({
    include: { parent: { select: { name: true } }, child: { select: { name: true } } },
    orderBy: { id: "asc" },
  });

  return NextResponse.json({ relations });
}
