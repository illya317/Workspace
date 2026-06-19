import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteCompanyByParams, updateCompanyField } from "@workspace/hr/server";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const updateFieldSchema = z.object({
  field: z.string().min(1),
  value: z.unknown().optional(),
}).passthrough();

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  const body = await request.clone().json().catch(() => null);
  const parsedBody = updateFieldSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  return updateCompanyField(request, Promise.resolve({ id: String(parsedParams.data.id) }));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  return deleteCompanyByParams(request, Promise.resolve({ id: String(parsedParams.data.id) }));
}
