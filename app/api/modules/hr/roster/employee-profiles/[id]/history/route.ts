import { NextResponse } from "next/server";
import { requireApiAccess, checkHRAccess } from "@workspace/platform/server/auth";
import { getEmployeeProfileHistoryByKey } from "@workspace/hr/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Props) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) {
    return jsonErrorResponse("无权限", 403);
  }

  const { id } = await params;
  const result = await getEmployeeProfileHistoryByKey(id);
  if (result.status === "invalid") return jsonErrorResponse("员工ID无效", 400);
  if (result.status === "not_found") return jsonErrorResponse("员工不存在", 404);
  return NextResponse.json(result.data);
}
