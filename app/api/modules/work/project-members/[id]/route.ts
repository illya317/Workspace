import { parseRouteIdParams, validatePassthroughBody } from "@workspace/platform/server/api";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";
import { deleteProjectMember, updateProjectMemberField } from "@workspace/work/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;

  const validation = await validatePassthroughBody(request);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });

  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return Response.json({ error: "ID 无效" }, { status: 400 });
  return updateProjectMemberField(request, Promise.resolve(parsedParams));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;

  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return Response.json({ error: "ID 无效" }, { status: 400 });
  return deleteProjectMember(request, Promise.resolve(parsedParams));
}
