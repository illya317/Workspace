import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { checkPermission } from "@/server/rbac/check";
import { previewQcTemplateEditorDraft } from "@/server/services/production/qc";

export const POST = withAuth(async (request) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  try {
    return NextResponse.json({ data: previewQcTemplateEditorDraft((body as Record<string, unknown>).draft) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "预览失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, (userId) => checkPermission(userId, "production.qc.templates", "access"));
