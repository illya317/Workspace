import { NextResponse } from "next/server";
import { withAuth, type RouteContext } from "@workspace/platform/server/with-auth";
import { getQcTemplateDetail } from "@workspace/production/server/qc";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuth(async (_req, _user, context?: RouteContext) => {
  const templateId = (await context?.params)?.templateId;
  if (!templateId) return jsonErrorResponse("缺少模板 ID", 400);
  try {
    const detail = await getQcTemplateDetail(templateId);
    return NextResponse.json({ data: detail });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid QC template id")) {
      return jsonErrorResponse("模板 ID 不合法", 400);
    }
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return jsonErrorResponse("模板不存在", 404);
    }
    throw error;
  }
});
