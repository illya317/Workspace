import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@workspace/platform/server/auth";
import { validateCompatibilityProxyBody } from "@workspace/platform/server/api";
import { createWorkPlan, listWorkPlans } from "@workspace/work/server";

async function canUseWorkPlan(userId: number, role: "access" | "write" | "delete" = "access") {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (await checkPermission(userId, "work.plan", role)) return true;
  return checkPermission(userId, "work", role);
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await canUseWorkPlan(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  return NextResponse.json(await listWorkPlans({ keyword, page, pageSize }));
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await canUseWorkPlan(payload.userId, "write"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const result = await createWorkPlan(request, payload.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data);
}
