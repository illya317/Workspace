import { NextResponse } from "next/server";
import { withAuth, type RouteContext } from "@/lib/with-auth";
import { checkPermission } from "@/server/rbac/check";
import { getQcTemplateEditorData } from "@/server/services/production/qc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuth(async (_request, _user, context?: RouteContext) => {
  const templateId = (await context?.params)?.templateId;
  if (!templateId) return NextResponse.json({ error: "缺少模板 ID" }, { status: 400 });
  try {
    return NextResponse.json({ data: await getQcTemplateEditorData(templateId) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid QC template id")) {
      return NextResponse.json({ error: "模板 ID 不合法" }, { status: 400 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return NextResponse.json({ error: "模板不存在" }, { status: 404 });
    }
    throw error;
  }
}, (userId) => checkPermission(userId, "production.qc.templates", "access"));
