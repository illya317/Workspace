import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const relations = await prisma.companyRelation.findMany({
    include: { parent: { select: { id: true, name: true } }, child: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  });

  return NextResponse.json({
    relations: relations.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      parentName: r.parent?.name || "",
      childId: r.childId,
      childName: r.child?.name || "",
      shareRatio: r.shareRatio,
      isConsolidated: r.isConsolidated,
    })),
  });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { parentId, childId, shareRatio, isConsolidated } = await request.json();
  if (!parentId || !childId) return NextResponse.json({ error: "缺少parentId或childId" }, { status: 400 });

  const item = await prisma.companyRelation.create({
    data: {
      parentId: Number(parentId),
      childId: Number(childId),
      shareRatio: shareRatio ? parseFloat(shareRatio) : null,
      isConsolidated: !!isConsolidated,
    },
  });
  return NextResponse.json({ item });
}
