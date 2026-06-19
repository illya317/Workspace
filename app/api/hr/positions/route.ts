import { NextResponse } from "next/server";
import { Prisma } from "@workspace/platform/server/prisma";
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@workspace/platform/server/auth";
import { routeIdParamsSchema, validateCompatibilityProxyBody } from "@workspace/platform/server/api";
import { createPosition, deletePosition, getPositionList, updatePosition } from "@workspace/hr/server";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const result = await getPositionList(keyword, page, pageSize);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const result = await createPosition(request);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return result.response;
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const body = await request.json();
  const { id, code, name, alias, departmentId, positionDescriptionId } = body;
  if (!id) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  try {
    const updated = await updatePosition(id, { code, name, alias, departmentId, positionDescriptionId }, payload.userId);
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
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRDelete(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsedQuery = routeIdParamsSchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  try {
    await deletePosition(parsedQuery.data.id);
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
