import { NextResponse } from "next/server";
import { authenticate, authorize } from "@workspace/platform/server/auth";
import { searchEmployeesForAccountLink } from "@workspace/hr/server";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await authorize({ user: payload.userId, resourceKey: "system", action: "admin" }))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  return NextResponse.json({ items: await searchEmployeesForAccountLink(q) });
}
