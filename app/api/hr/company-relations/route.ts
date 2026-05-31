import { handleCreate } from "@/lib/crud";
import { NextResponse } from "next/server";

const CONFIG = { entityType: "CompanyRelation", modelKey: "companyRelation" as const };
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";


export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const relations = await prisma.companyRelation.findMany({
    include: { parent: { select: { id: true, name: true } }, child: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  });

  const mapped = relations.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    parentName: r.parent?.name || "",
    childId: r.childId,
    childName: r.child?.name || "",
    shareRatio: r.shareRatio,
    isConsolidated: r.isConsolidated,
  }));

  let result = mapped;
  if (keyword) {
    const q = keyword.toLowerCase();
    result = mapped.filter((r) =>
      (r.parentName || "").toLowerCase().includes(q) ||
      (r.childName || "").toLowerCase().includes(q)
    );
  }

  const total = result.length;
  const start = (page - 1) * pageSize;
  const paged = result.slice(start, start + pageSize);

  return NextResponse.json({ relations: paged, total });
}

export async function POST(request: Request) {
  return handleCreate(request, CONFIG, (body) => {
    const required = ["parentId","childId"];
    for (const f of required) if (!body[f]) return null;
    return body;
  });
}
