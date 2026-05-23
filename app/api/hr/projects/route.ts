import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchAnyField } from "@/lib/search-schema";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId)))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";

  let projects = await prisma.project.findMany({
    orderBy: { id: "desc" },
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
  if (!(await checkHRAccess(payload.userId)))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { name, type, departmentIds, description } = await request.json();
  if (!name) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      name,
      type: type || "project",
      description: description || null,
      editedBy: payload.userId,
    },
  });
  return NextResponse.json({ project });
}
