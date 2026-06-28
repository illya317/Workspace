import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess, checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";
import {
  createEmployeeContract,
  getContracts,
} from "@workspace/hr/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

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
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const { searchParams } = new URL(request.url);
  const parsedQuery = contractsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return jsonErrorResponse("参数错误", 400);
  const { company, department, isActive = null, keyword, page, pageSize, position } = parsedQuery.data;

  const result = await getContracts({ company, department, isActive, keyword, page, pageSize, position });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const body = await request.json().catch(() => null);
  const parsedBody = createContractSchema.safeParse(body);
  if (!parsedBody.success) return jsonErrorResponse("请求体必须为 JSON", 400);
  const { employeeId, ...contractData } = parsedBody.data;

  const result = await createEmployeeContract({ employeeId, contractData, editorId: payload.userId });

  if (!result.success) {
    return jsonErrorResponse(result.error, result.status || 400);
  }

  return NextResponse.json({ success: true });
}
