import { NextResponse } from "next/server";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";
import { authenticate, checkHRAccess } from "@workspace/platform/server/auth";
import { getEmployeeProfileByKey } from "@workspace/hr/server";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Props) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const result = await getEmployeeProfileByKey(id);
  if (result.status === "invalid") return NextResponse.json({ error: "员工ID无效" }, { status: 400 });
  if (result.status === "not_found") return NextResponse.json({ error: "员工不存在" }, { status: 404 });
  return NextResponse.json(result.data);
}
