import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess, checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";
import {
  createEmployeeContract,
  getContracts,
} from "@workspace/hr/server";

const contractsQuerySchema = z.object({
  company: z.string().optional(),
  department: z.string().catch(""),
  isActive: z.string().nullable().optional(),
  keyword: z.string().optional(),
  position: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createContractSchema = z.object({
  employeeId: z.unknown().optional(),
}).passthrough();

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsedQuery = contractsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const { company, department, isActive = null, keyword, page, pageSize, position } = parsedQuery.data;

  const result = await getContracts({ company, department, isActive, keyword, page, pageSize, position });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsedBody = createContractSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  const { employeeId, ...contractData } = parsedBody.data;

  const result = await createEmployeeContract({ employeeId, contractData, editorId: payload.userId });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 400 }
    );
  }

  return NextResponse.json({ success: true });
}
