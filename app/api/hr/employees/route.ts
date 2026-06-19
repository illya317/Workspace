import { NextResponse } from "next/server";
import { withHRAccess, withHRWrite } from "@/lib/with-auth";
import { createEmployeeWithAccount, listEmployees } from "@workspace/hr/server";

export const GET = withHRAccess(async (request: Request, _user) => {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  return NextResponse.json(await listEmployees({ keyword, page, pageSize }));
});

export const POST = withHRWrite(async (request: Request, user) => {
  const body = await request.json().catch(() => null);
  const name = typeof body === "object" && body ? String((body as { name?: unknown }).name || "") : "";
  const result = await createEmployeeWithAccount(name, user.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true, employee: result.employee, user: result.user });
});
