import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { checkPermission } from "@/server/rbac/check";
import {
  getQcTemplateFeedback,
  listQcTemplateFeedbackByContext,
  listQcTemplateFeedback,
  saveQcTemplateInlineFeedback,
  saveQcTemplateFeedback,
  updateQcTemplateFeedbackResolved,
} from "@/server/services/production/qc";

export const GET = withAuth(async (request, user) => {
  const key = new URL(request.url).searchParams.get("key")?.trim();
  if (key) {
    const [data, items] = await Promise.all([
      getQcTemplateFeedback(key, user.userId),
      listQcTemplateFeedbackByContext(key),
    ]);
    return NextResponse.json({ data, items });
  }
  return NextResponse.json({ data: await listQcTemplateFeedback() });
}, (userId) => checkPermission(userId, "production.qc.templates", "access"));

export const POST = withAuth(async (request, user) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  try {
    const author = {
      userId: user.userId,
      userName: user.name,
    };
    const item = data.inlineEntry
      ? await saveQcTemplateInlineFeedback(data.context, data.inlineEntry, author)
      : await saveQcTemplateFeedback(data.context, data.sections ?? data.note, author);
    const list = await listQcTemplateFeedback();
    return NextResponse.json({ data: item, keys: list.keys, states: list.states });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存反馈失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, (userId) => checkPermission(userId, "production.qc.templates", "write"));

export const PATCH = withAuth(async (request, user) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  const key = String(data.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "缺少反馈 key" }, { status: 400 });
  try {
    const item = await updateQcTemplateFeedbackResolved(key, data.resolved === true, {
      userId: user.userId,
      userName: user.name,
    }, {
      type: data.targetType === "section" || data.targetType === "inline" ? data.targetType : undefined,
      id: String(data.targetId ?? "").trim() || undefined,
    });
    return NextResponse.json({ data: item, list: await listQcTemplateFeedback() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新反馈状态失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, (userId) => checkPermission(userId, "production.qc.templates", "write"));
