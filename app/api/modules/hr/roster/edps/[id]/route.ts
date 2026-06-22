import { NextResponse } from "next/server";
import { routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";
import { deleteEdp, updateEdpField } from "@workspace/hr/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "记录ID无效" }, { status: 400 });
  const body = await request.clone().json().catch(() => null);
  const parsedBody = updateFieldBodySchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  return updateEdpField(request, Promise.resolve({ id: String(parsedParams.data.id) }));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "记录ID无效" }, { status: 400 });
  return deleteEdp(request, Promise.resolve({ id: String(parsedParams.data.id) }));
}
