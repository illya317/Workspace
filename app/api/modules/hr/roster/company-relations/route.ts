import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess, checkHRAccess } from "@workspace/platform/server/auth";
import { createCompanyRelation, listCompanyRelations } from "@workspace/hr/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

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
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const { searchParams } = new URL(request.url);
  const parsedQuery = companyRelationsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return jsonErrorResponse("参数错误", 400);
  const { keyword, page, pageSize } = parsedQuery.data;
  return NextResponse.json(await listCompanyRelations({ keyword, page, pageSize }));
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const body = await request.clone().json().catch(() => null);
  const parsedBody = createCompanyRelationSchema.safeParse(body);
  if (!parsedBody.success) return jsonErrorResponse("缺少 parentId/childId", 400);
  return createCompanyRelation(request);
}
