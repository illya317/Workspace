import { NextResponse } from "next/server";

import { withHRAccess, withHRDelete, withHRWrite } from "@workspace/platform/server/with-auth";
import { jsonServiceResponse, routeIdParamsSchema, validateCompatibilityProxyBody } from "@workspace/platform/server/api";
import { createDepartment, deleteDepartmentByParams, listDepartments, updateDepartment } from "@workspace/hr/server";

export const GET = withHRAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  const archived = searchParams.get("archived") === "1" || searchParams.get("archived") === "true";
  return NextResponse.json(await listDepartments({ keyword, page, pageSize, archived }));
});

export const POST = withHRWrite(async (request: Request, user) => {
  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const body = await request.json();
  return jsonServiceResponse(await createDepartment(body, user.userId));
});

export const PUT = withHRWrite(async (request: Request, user) => {
  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const body = await request.json();
  return jsonServiceResponse(await updateDepartment(body, user.userId));
});

export const DELETE = withHRDelete(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsedQuery = routeIdParamsSchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  return deleteDepartmentByParams(request, Promise.resolve({ id: String(parsedQuery.data.id) }));
});
