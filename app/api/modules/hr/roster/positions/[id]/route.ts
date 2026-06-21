import { NextResponse } from "next/server";
import { routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { deletePositionByParams, updatePositionField } from "@workspace/hr/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  const body = await request.clone().json().catch(() => null);
  const parsedBody = updateFieldBodySchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  return updatePositionField(request, Promise.resolve({ id: String(parsedParams.data.id) }));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  return deletePositionByParams(request, Promise.resolve({ id: String(parsedParams.data.id) }));
}
