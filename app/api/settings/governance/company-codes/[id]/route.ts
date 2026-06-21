import { NextResponse } from "next/server";
import { deleteCompanyByParams, updateCompanyField } from "@workspace/hr/server";
import { parseRouteIdParams } from "@workspace/platform/server/api";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return NextResponse.json({ error: "公司 ID 无效" }, { status: 400 });
  return updateCompanyField(request, Promise.resolve(parsedParams));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return NextResponse.json({ error: "公司 ID 无效" }, { status: 400 });
  return deleteCompanyByParams(request, Promise.resolve(parsedParams));
}
