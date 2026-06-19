import { NextResponse } from "next/server";
import { jsonServiceResponse, routeIdParamsSchema, rowsRequestBodySchema } from "@workspace/platform/server/api";
import { authenticate, checkHRWrite } from "@workspace/platform/server/auth";
import { updateEmployeeProfileEdps } from "@workspace/hr/server";

interface Props {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: Props) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "员工ID无效" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsedBody = rowsRequestBodySchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  return jsonServiceResponse(await updateEmployeeProfileEdps(parsedParams.data.id, parsedBody.data.rows, payload.userId));
}
