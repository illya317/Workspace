import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { checkPermission } from "@/server/rbac/check";
import { saveQcTemplateEditorDraft } from "@/server/services/production/qc";

export const PATCH = withAuth(async (request, user) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  try {
    const draft = await saveQcTemplateEditorDraft((body as Record<string, unknown>).draft, {
      userId: user.userId,
      userName: user.name,
    });
    return NextResponse.json({ data: draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存草稿失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, (userId) => checkPermission(userId, "production.qc.templates", "write"));
