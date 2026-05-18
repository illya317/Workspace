import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const version = searchParams.get("version");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "缺少 entityType 或 entityId" }, { status: 400 });
  }

  if (version) {
    const snapshot = await prisma.editHistory.findUnique({
      where: {
        entityType_entityId_version: {
          entityType,
          entityId,
          version: parseInt(version),
        },
      },
    });
    if (!snapshot) {
      return NextResponse.json({ error: "版本不存在" }, { status: 404 });
    }
    return NextResponse.json({ version: snapshot });
  }

  const versions = await prisma.editHistory.findMany({
    where: { entityType, entityId },
    orderBy: { version: "desc" },
    select: { version: true, createdAt: true, editedBy: true },
    take: 50,
  });

  return NextResponse.json({ versions });
}
