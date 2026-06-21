import { NextResponse } from "next/server";
import { requireApiAccess, checkHRAccess } from "@workspace/platform/server/auth";
import { getEmployeeProfileHistoryByKey } from "@workspace/hr/server";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Props) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const result = await getEmployeeProfileHistoryByKey(id);
  if (result.status === "invalid") return NextResponse.json({ error: "员工ID无效" }, { status: 400 });
  if (result.status === "not_found") return NextResponse.json({ error: "员工不存在" }, { status: 404 });
  return NextResponse.json(result.data);
}
