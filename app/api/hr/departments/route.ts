import { NextResponse } from "next/server";

import { withHRAccess, withHRDelete, withHRWrite } from "@/lib/with-auth";
import { jsonServiceResponse } from "@workspace/platform/server/api";
import { createDepartment, deleteDepartment, listDepartments, updateDepartment } from "@workspace/hr/server";

export const GET = withHRAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  return NextResponse.json(await listDepartments({ keyword, page, pageSize }));
});

export const POST = withHRWrite(async (request: Request, user) => {
  const body = await request.json();
  return jsonServiceResponse(await createDepartment(body, user.userId));
});

export const PUT = withHRWrite(async (request: Request, user) => {
  const body = await request.json();
  return jsonServiceResponse(await updateDepartment(body, user.userId));
});

export const DELETE = withHRDelete(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  return jsonServiceResponse(await deleteDepartment(searchParams.get("id")));
});
