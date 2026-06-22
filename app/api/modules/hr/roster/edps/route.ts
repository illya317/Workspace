import { NextResponse } from "next/server";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";
import { z } from "zod";
import { authenticate, checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";
import { jsonServiceResponse } from "@workspace/platform/server/api";
import { createEdp, EDPCreateSchema, listEdps } from "@workspace/hr/server";

const edpsQuerySchema = z.object({
  keyword: z.string().catch(""),
  isActive: z.string().nullable().optional(),
  company: z.string().catch(""),
  department: z.string().catch(""),
  position: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

export async function GET(request: Request) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = edpsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const { company, department, isActive = null, keyword, page, pageSize, position } = parsedQuery.data;
  return NextResponse.json(await listEdps({ company, department, isActive, keyword, page, pageSize, position }));
}

export async function POST(request: Request) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.clone().json().catch(() => null);
  const parsedBody = EDPCreateSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }

  return jsonServiceResponse(await createEdp(parsedBody.data, payload.userId));
}
