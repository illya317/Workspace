import { jsonErrorResponse, parseRouteIdParams, validatePassthroughBody } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { deleteProject, updateProjectField } from "@workspace/work/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const validation = await validatePassthroughBody(request);
  if (!validation.ok) return jsonErrorResponse(validation.error, 400);

  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return jsonErrorResponse("ID 无效", 400);
  return updateProjectField(request, Promise.resolve(parsedParams));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return jsonErrorResponse("ID 无效", 400);
  return deleteProject(request, Promise.resolve(parsedParams));
}
