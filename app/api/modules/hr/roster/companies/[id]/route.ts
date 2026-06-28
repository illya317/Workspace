import { jsonErrorResponse, routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { deleteCompanyByParams, updateCompanyField } from "@workspace/hr/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("ID 无效", 400);
  const body = await request.clone().json().catch(() => null);
  const parsedBody = updateFieldBodySchema.safeParse(body);
  if (!parsedBody.success) return jsonErrorResponse("参数错误", 400);
  return updateCompanyField(request, Promise.resolve({ id: String(parsedParams.data.id) }));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("ID 无效", 400);
  return deleteCompanyByParams(request, Promise.resolve({ id: String(parsedParams.data.id) }));
}
