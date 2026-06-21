import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, checkHRAccess } from "@workspace/platform/server/auth";
import { createCompanyRelation, listCompanyRelations } from "@workspace/hr/server";

const companyRelationsQuerySchema = z.object({
  keyword: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createCompanyRelationSchema = z.object({
  parentId: z.unknown(),
  childId: z.unknown(),
}).passthrough();

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsedQuery = companyRelationsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const { keyword, page, pageSize } = parsedQuery.data;
  return NextResponse.json(await listCompanyRelations({ keyword, page, pageSize }));
}

export async function POST(request: Request) {
  const body = await request.clone().json().catch(() => null);
  const parsedBody = createCompanyRelationSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "缺少 parentId/childId" }, { status: 400 });
  return createCompanyRelation(request);
}
