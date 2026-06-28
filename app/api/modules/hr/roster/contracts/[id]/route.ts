import { NextResponse } from "next/server";
import { jsonErrorResponse, routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { requireApiAccess, checkHRWrite, checkHRDelete } from "@workspace/platform/server/auth";
import { deleteContract, updateContractField } from "@workspace/hr/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("ID 无效", 400);

  const body = await request.json().catch(() => null);
  const parsedBody = updateFieldBodySchema.safeParse(body);
  if (!parsedBody.success) return jsonErrorResponse("参数错误", 400);
  const { field, value } = parsedBody.data;
  const result = await updateContractField(parsedParams.data.id, field, value, payload.userId);
  if (!result.ok) return jsonErrorResponse(result.error, result.status || 400);
  return NextResponse.json(result.data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRDelete(payload.userId, "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("ID 无效", 400);
  const result = await deleteContract(parsedParams.data.id, payload.userId);
  if (!result.ok) return jsonErrorResponse(result.error, result.status || 400);
  return NextResponse.json(result.data);
}
