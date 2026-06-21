import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, checkHRAccess, checkHRWrite, checkHRDelete } from "@workspace/platform/server/auth";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCompany, deleteCompanyById, listCompanies, upsertCompany } from "@workspace/hr/server";

const companiesQuerySchema = z.object({
  keyword: z.string().catch(""),
  active: z.string().optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createCompanySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
}).passthrough();

const upsertCompanySchema = z.object({
  id: z.unknown().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
}).passthrough();

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = companiesQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const keyword = parsedQuery.data.keyword;
  const activeOnly = parsedQuery.data.active === "1";
  const { page, pageSize } = parsedQuery.data;
  return NextResponse.json(await listCompanies({ keyword, activeOnly, page, pageSize }));
}

export async function POST(request: Request) {
  const body = await request.clone().json().catch(() => null);
  const parsedBody = createCompanySchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "缺少 code/name" }, { status: 400 });
  return createCompany(request);
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = upsertCompanySchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "缺少 code/name" }, { status: 400 });
  const result = await upsertCompany(parsedBody.data, payload.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data);
}

export async function DELETE(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRDelete(payload.userId, "people.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = routeIdParamsSchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "缺少id" }, { status: 400 });
  const result = await deleteCompanyById(parsedQuery.data.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  return NextResponse.json(result.data);
}
