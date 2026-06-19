import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, checkHRWrite } from "@workspace/platform/server/auth";
import { updateEmployeeProfileContracts } from "@workspace/hr/server";

interface Props {
  params: Promise<{ id: string }>;
}

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const rowsRequestSchema = z.object({
  rows: z.unknown().optional(),
}).passthrough();

function serviceResponse<T>(result: { ok: true; data: T } | { ok: false; error: string; status?: number }) {
  if (result.ok) return NextResponse.json(result.data);
  return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
}

export async function PUT(request: Request, { params }: Props) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "员工ID无效" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsedBody = rowsRequestSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  return serviceResponse(await updateEmployeeProfileContracts(parsedParams.data.id, parsedBody.data.rows, payload.userId));
}
