import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@workspace/platform/server/auth";
import { createEmployment, listEmployments } from "@workspace/hr/server";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const isActive = searchParams.get("isActive");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  return NextResponse.json(await listEmployments({ keyword, isActive, page, pageSize }));
}

export async function POST(request: Request) {
  return createEmployment(request);
}
