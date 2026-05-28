import { handleCreate } from "@/lib/crud";
import { NextResponse } from "next/server";

const CONFIG = { entityType: "Position", modelKey: "position" as const };
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { matchAnyField } from "@/lib/search-schema";
import { snapshotHistory } from "@/lib/history";
import { isPharma } from "@/lib/company";
import { PositionCreateSchema, parseJson } from "@/lib/schemas";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const where: Prisma.PositionWhereInput = {};

  const positions = await prisma.position.findMany({
    where,
    include: {
      _count: { select: { edps: true } },
      department: { select: { id: true, name: true } },
      positionDescription: { select: { id: true, name: true, details: true } },
    },
    orderBy: { id: "asc" },
  });

  let result = positions.map((p) => {
    let codeRaw: string | null = null;
    if (p.positionDescription?.details) {
      try {
        const details = JSON.parse(p.positionDescription.details);
        codeRaw = details.code_raw || null;
      } catch {}
    }
    return {
      id: p.id,
      code: p.code,
      codeRaw,
      name: p.name,
      alias: p.alias || null,
      company: isPharma(p.code) ? '丰华制药' : '丰华生物',
      departmentId: p.departmentId,
      departmentName: p.department?.name || null,
      positionDescriptionId: p.positionDescriptionId,
      positionDescriptionName: p.positionDescription?.name || null,
      headcount: p._count.edps,
    };
  });
  if (keyword) result = result.filter((p) => matchAnyField(p, keyword, "Position"));

  const total = result.length;
  const start = (page - 1) * pageSize;
  const paged = result.slice(start, start + pageSize);
  return NextResponse.json({ positions: paged, total });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsed = await parseJson(request, PositionCreateSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return handleCreate(request, CONFIG, () => parsed.data);
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRWrite(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { id, code, name, alias } = body;

  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  const data: Prisma.PositionUpdateInput = {};
  if (code !== undefined) data.code = code;
  if (name !== undefined) data.name = name;
  if (alias !== undefined) data.alias = alias || null;
  data.editedBy = payload.userId;
  data.editedAt = new Date();
  data.version = { increment: 1 };

  try {
    const updated = await prisma.position.update({
      where: { id },
      data,
    });
    await snapshotHistory("Position", id, payload.userId);
    return NextResponse.json({ success: true, position: updated });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "编码已存在" }, { status: 409 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "岗位不存在" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRDelete(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  try {
    await prisma.position.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "岗位不存在" }, { status: 404 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json({ error: "该岗位下有关联员工，无法删除" }, { status: 409 });
    }
    throw e;
  }
}
