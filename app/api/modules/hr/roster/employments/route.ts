import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess, checkHRAccess } from "@workspace/platform/server/auth";
import { createEmployment, listEmployments } from "@workspace/hr/server";

const employmentsQuerySchema = z.object({
  keyword: z.string().catch(""),
  isActive: z.string().nullable().optional(),
  company: z.string().catch(""),
  department: z.string().catch(""),
  position: z.string().catch(""),
  personnelType: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createEmploymentSchema = z.object({
  employeeId: z.unknown(),
}).passthrough();

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsedQuery = employmentsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const { keyword, isActive = null, company, department, position, personnelType, page, pageSize } = parsedQuery.data;
  return NextResponse.json(await listEmployments({ keyword, isActive, company, department, position, personnelType, page, pageSize }));
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const body = await request.clone().json().catch(() => null);
  const parsedBody = createEmploymentSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  return createEmployment(request);
}
