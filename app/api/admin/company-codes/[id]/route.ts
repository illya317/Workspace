import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteCompanyByParams, updateCompanyField } from "@workspace/hr/server";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

async function parseParams(params: Promise<{ id: string }>) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return null;
  return { id: String(parsedParams.data.id) };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = await parseParams(params);
  if (!parsedParams) return NextResponse.json({ error: "公司 ID 无效" }, { status: 400 });
  return updateCompanyField(request, Promise.resolve(parsedParams));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = await parseParams(params);
  if (!parsedParams) return NextResponse.json({ error: "公司 ID 无效" }, { status: 400 });
  return deleteCompanyByParams(request, Promise.resolve(parsedParams));
}
