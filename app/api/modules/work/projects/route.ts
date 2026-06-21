import { NextResponse } from "next/server";
import { authenticate } from "@workspace/platform/server/auth";
import { validatePassthroughBody } from "@workspace/platform/server/api";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";
import { canUseProject, createProject, listProjects } from "@workspace/work/server";

export async function GET(request: Request) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;

  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await canUseProject(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  const archived = searchParams.get("archived") === "1" || searchParams.get("archived") === "true";
  return NextResponse.json(await listProjects({ userId: payload.userId, keyword, page, pageSize, archived }));
}

export async function POST(request: Request) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;

  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await canUseProject(payload.userId, "write"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const validation = await validatePassthroughBody(request);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const result = await createProject(request, payload.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  return NextResponse.json(result.data);
}
