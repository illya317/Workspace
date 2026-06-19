import { parseRouteIdParams, validateCompatibilityProxyBody } from "@workspace/platform/server/api";
import { deleteWorkPlan, updateWorkPlanField } from "@workspace/work/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const validation = await validateCompatibilityProxyBody(request);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });

  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return Response.json({ error: "ID 无效" }, { status: 400 });
  return updateWorkPlanField(request, Promise.resolve(parsedParams));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return Response.json({ error: "ID 无效" }, { status: 400 });
  return deleteWorkPlan(request, Promise.resolve(parsedParams));
}
