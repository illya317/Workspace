import { jsonErrorResponse, serviceResponse, routeIdParamsSchema, rowsRequestBodySchema } from "@workspace/platform/server/api";
import { requireApiAccess, checkHRWrite } from "@workspace/platform/server/auth";
import { updateEmployeeProfileContracts } from "@workspace/hr/server";

interface Props {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("员工ID无效", 400);
  const body = await request.json().catch(() => null);
  const parsedBody = rowsRequestBodySchema.safeParse(body);
  if (!parsedBody.success) return jsonErrorResponse("参数错误", 400);
  return serviceResponse(await updateEmployeeProfileContracts(parsedParams.data.id, parsedBody.data.rows, payload.userId));
}
