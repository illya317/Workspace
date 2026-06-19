import { NextResponse } from "next/server";

import { withHRAccess, withHRDelete, withHRWrite } from "@/lib/with-auth";
import { createDepartment, deleteDepartment, listDepartments, updateDepartment } from "@workspace/hr/server";

function serviceResponse<T>(result: { ok: true; data: T } | { ok: false; error: string; status?: number }) {
  if (result.ok) return NextResponse.json(result.data);
  return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
}

export const GET = withHRAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  return NextResponse.json(await listDepartments({ keyword, page, pageSize }));
});

export const POST = withHRWrite(async (request: Request, user) => {
  const body = await request.json();
  return serviceResponse(await createDepartment(body, user.userId));
});

export const PUT = withHRWrite(async (request: Request, user) => {
  const body = await request.json();
  return serviceResponse(await updateDepartment(body, user.userId));
});

export const DELETE = withHRDelete(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  return serviceResponse(await deleteDepartment(searchParams.get("id")));
});
