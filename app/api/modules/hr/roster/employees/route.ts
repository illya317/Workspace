import { NextResponse } from "next/server";
import { z } from "zod";
import { withHRAccess, withHRWrite } from "@workspace/platform/server/with-auth";
import { createEmployeeWithAccount, listEmployees } from "@workspace/hr/server";

const employeesQuerySchema = z.object({
  keyword: z.string().catch(""),
  isActive: z.string().nullable().optional(),
  company: z.string().catch(""),
  employmentStatus: z.enum(["active", "inactive"]).optional().catch(undefined),
  filterField: z.string().catch(""),
  filterValue: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createEmployeeSchema = z.object({
  name: z.string().min(1, "姓名必填"),
}).passthrough();

export const GET = withHRAccess(async (request: Request, _user) => {
  const { searchParams } = new URL(request.url);
  const parsedQuery = employeesQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const { company, employmentStatus, isActive = null, keyword, filterField, filterValue, page, pageSize } = parsedQuery.data;
  return NextResponse.json(await listEmployees({ company, employmentStatus, isActive, keyword, filterField, filterValue, page, pageSize }));
});

export const POST = withHRWrite(async (request: Request, user) => {
  const body = await request.json().catch(() => null);
  const parsedBody = createEmployeeSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }
  const result = await createEmployeeWithAccount(parsedBody.data.name, user.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true, employee: result.employee, user: result.user });
});
