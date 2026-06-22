import { parseRouteIdParams, updateFieldBodySchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { deleteProjectMember, updateProjectMemberField } from "@workspace/work/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const body = await request.clone().json().catch(() => null);
  const parsedBody = updateFieldBodySchema.safeParse(body);
  if (!parsedBody.success) return Response.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });

  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return Response.json({ error: "ID 无效" }, { status: 400 });
  return updateProjectMemberField(new Request(request, { body: JSON.stringify(parsedBody.data) }), Promise.resolve(parsedParams));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = await parseRouteIdParams(params);
  if (!parsedParams) return Response.json({ error: "ID 无效" }, { status: 400 });
  return deleteProjectMember(request, Promise.resolve(parsedParams));
}
