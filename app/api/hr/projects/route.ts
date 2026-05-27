import { handleCreate } from "@/lib/crud";
import { NextResponse } from "next/server";

const CONFIG = { entityType: "Project", modelKey: "project" as const };
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchAnyField } from "@/lib/search-schema";
import { ProjectCreateSchema, parseJson } from "@/lib/schemas";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId)))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";

  let projects = await prisma.project.findMany({
    orderBy: { id: "asc" },
    include: {
      _count: { select: { employees: true } },
    },
  });
  if (keyword) projects = projects.filter((p) => matchAnyField(p, keyword, "Project"));
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsed = await parseJson(request, ProjectCreateSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return handleCreate(request, CONFIG, () => parsed.data);
}


