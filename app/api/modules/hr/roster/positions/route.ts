import { NextResponse } from "next/server";
import { checkHRAccess, checkHRWrite, checkHRDelete, requireApiAccess } from "@workspace/platform/server/auth";
import { jsonServiceResponse, routeIdParamsSchema, validateCompatibilityProxyBody } from "@workspace/platform/server/api";
import { createPosition, deletePositionByParams, getPositionList, PositionCreateSchema, updatePosition } from "@workspace/hr/server";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  const archived = searchParams.get("archived") === "1" || searchParams.get("archived") === "true";

  const result = await getPositionList(keyword, page, pageSize, archived);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const body = await request.json();
  const parsedBody = PositionCreateSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }
  return jsonServiceResponse(await createPosition(parsedBody.data, payload.userId));
}

export async function PUT(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const body = await request.json();
  const { id, code, name, alias, departmentId, positionDescriptionId, isArchived } = body;
  if (!id) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  return jsonServiceResponse(await updatePosition(id, { code, name, alias, departmentId, positionDescriptionId, isArchived }, payload.userId));
}

export async function DELETE(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRDelete(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsedQuery = routeIdParamsSchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  return deletePositionByParams(request, Promise.resolve({ id: String(parsedQuery.data.id) }));
}
