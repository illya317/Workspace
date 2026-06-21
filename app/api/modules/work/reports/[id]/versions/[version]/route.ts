import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@workspace/platform/server/auth";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";
import { getReportAccessMetadata, getReportVersion } from "@workspace/work/server";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  version: z.coerce.number().int().min(0),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;

  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "报告版本参数无效" }, { status: 400 });
  }

  const { id: reportId, version: versionNum } = parsedParams.data;
  const report = await getReportAccessMetadata(reportId);
  const canViewReport = report && report.userId === payload.userId;

  if (!canViewReport) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const versionedReport = await getReportVersion(reportId, versionNum);
  if (!versionedReport) {
    return NextResponse.json({ error: "版本不存在" }, { status: 404 });
  }

  return NextResponse.json({ report: versionedReport });
}
