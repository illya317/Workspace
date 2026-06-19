import { NextResponse } from "next/server";
import { authenticate } from "@workspace/platform/server/auth";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { getReportAccessMetadata, listReportHistory } from "@workspace/work/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "报告 ID 无效" }, { status: 400 });
  }

  const reportId = parsedParams.data.id;
  const report = await getReportAccessMetadata(reportId);
  const canAccess = report && report.userId === payload.userId;

  if (!canAccess) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const history = await listReportHistory(reportId);

  return NextResponse.json({ history });
}
