import { NextResponse } from "next/server";
import { deleteCompanyRelation, updateCompanyRelationField } from "@workspace/hr/server";
import { parseRouteIdParams } from "@workspace/platform/server/api";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return NextResponse.json({ error: "公司关系 ID 无效" }, { status: 400 });
  return updateCompanyRelationField(request, Promise.resolve(parsedParams));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return NextResponse.json({ error: "公司关系 ID 无效" }, { status: 400 });
  return deleteCompanyRelation(request, Promise.resolve(parsedParams));
}
