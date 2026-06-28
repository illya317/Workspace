import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess, checkHRAccess, checkHRDelete, checkHRWrite } from "@workspace/platform/server/auth";
import { deletePositionCode, getPositionCodes, upsertPositionCode } from "@workspace/hr/server/position-codes";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const upsertPositionCodeSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  company: z.string().optional(),
  companyCode: z.string().optional(),
  originalCode: z.string().optional(),
  departmentCode: z.string().optional(),
});

const deletePositionCodeQuerySchema = z.object({
  code: z.string().trim().min(1),
});

export async function GET(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const { searchParams } = new URL(request.url);
  const result = await getPositionCodes({
    companys: searchParams.get("companys") || undefined,
    company: searchParams.get("company") || undefined,
    departmentCode: searchParams.get("departmentCode") || undefined,
    positionCode: searchParams.get("positionCode") || undefined,
  });
  return NextResponse.json(result);
}

export async function PUT(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const parsedBody = upsertPositionCodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return jsonErrorResponse("缺少参数", 400);

  const result = await upsertPositionCode(parsedBody.data, payload.userId);
  return NextResponse.json(result);
}

export async function DELETE(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRDelete(payload.userId, "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const { searchParams } = new URL(request.url);
  const parsedQuery = deletePositionCodeQuerySchema.safeParse({ code: searchParams.get("code") });
  if (!parsedQuery.success) return jsonErrorResponse("缺少code", 400);

  const result = await deletePositionCode(parsedQuery.data.code, payload.userId);
  return NextResponse.json(result);
}
