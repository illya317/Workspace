import { handleCreate } from "@/lib/crud";
import { NextResponse } from "next/server";

const CONFIG = { entityType: "Department", modelKey: "department" as const };
import { withHRAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { matchAnyField } from "@/lib/search-schema";
import { snapshotHistory } from "@/lib/history";
import { isPharma } from "@/lib/company";

export const GET = withHRAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const company = searchParams.get("company") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const where: any = {};
  if (company) where.company = company;

  const depts = await prisma.department.findMany({
    where,
    include: {
      _count: { select: { edps: true } },
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
    },
    orderBy: { id: "asc" },
  });

  let departments = depts.map((d: any) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    alias: d.alias || null,
    company: isPharma(d.code) ? '丰华制药' : '丰华生物',
    level: d.level,
    levelLabel: d.level === 1 ? '事业部' : d.level === 2 ? '部门' : '子部门',
    parentId: d.parentId,
    parentName: d.parent?.name || null,
    managerUserId: d.managerUserId,
    managerName: d.manager?.name || null,
    headcount: d._count.edps,
    children: (d.children as any[]).map((c: any) => ({ id: c, name: c })),
  }));
  if (keyword) departments = departments.filter((d) => matchAnyField(d, keyword, "Department"));

  const total = departments.length;
  const start = (page - 1) * pageSize;
  const paged = departments.slice(start, start + pageSize);
  return NextResponse.json({ departments: paged, total });
});

export async function POST(request: Request) {
  return handleCreate(request, CONFIG, (body) => {
    const required = ["code","name"];
    for (const f of required) if (!body[f]) return null;
    return body;
  });
}

export const PUT = withHRAccess(async (request: Request, user) => {
  const body = await request.json();
  const { id, code, name, alias, company, level, parentId, managerUserId } = body;

  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  const data: any = {};
  if (code !== undefined) data.code = code;
  if (name !== undefined) data.name = name;
  if (alias !== undefined) data.alias = alias || null;
  if (company !== undefined) data.company = company;
  if (level !== undefined) data.level = level;
  if (parentId !== undefined) data.parentId = parentId || null;
  if (managerUserId !== undefined) data.managerUserId = managerUserId || null;
  data.editedBy = user.userId;
  data.editedAt = new Date();
  data.version = { increment: 1 };

  try {
    const updated = await prisma.department.update({
      where: { id },
      data,
    });
    await snapshotHistory("Department", id, user.userId);
    return NextResponse.json({ success: true, department: updated });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "编码已存在" }, { status: 409 });
    }
    if (e.code === "P2025") {
      return NextResponse.json({ error: "部门不存在" }, { status: 404 });
    }
    throw e;
  }
});

export const DELETE = withHRAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  try {
    await prisma.department.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e.code === "P2025") {
      return NextResponse.json({ error: "部门不存在" }, { status: 404 });
    }
    if (e.code === "P2003") {
      return NextResponse.json({ error: "该部门下有关联岗位，无法删除" }, { status: 409 });
    }
    throw e;
  }
});
