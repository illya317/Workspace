import { handleCreate } from "@/lib/crud";
import { NextResponse } from "next/server";

const CONFIG = { entityType: "CompanyRelation", modelKey: "companyRelation" as const };
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

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
  return handleCreate(request, CONFIG, (body) => {
    const required = ["parentId","childId"];
    for (const f of required) if (!body[f]) return null;
    return body;
  });
}


