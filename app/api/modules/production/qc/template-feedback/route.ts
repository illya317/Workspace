import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@workspace/platform/server/with-auth";
import { authorize } from "@workspace/platform/server/auth";
import {
  getQcTemplateFeedback,
  listQcTemplateFeedbackByContext,
  listQcTemplateFeedback,
  saveQcTemplateInlineFeedback,
  saveQcTemplateFeedback,
  updateQcTemplateFeedbackResolved,
} from "@workspace/production/server/qc";

const feedbackQuerySchema = z.object({
  key: z.string().trim().optional(),
}).passthrough();

const saveFeedbackSchema = z.object({
  context: z.unknown(),
  sections: z.unknown().optional(),
  note: z.unknown().optional(),
  inlineEntry: z.unknown().optional(),
}).passthrough();

const updateFeedbackResolvedSchema = z.object({
  key: z.coerce.string().trim().min(1),
  resolved: z.unknown().optional(),
  targetType: z.string().optional(),
  targetId: z.coerce.string().optional(),
}).passthrough();

export const GET = withAuth(async (request, user) => {
  const parsedQuery = feedbackQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsedQuery.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const key = parsedQuery.data.key;
  if (key) {
    const [data, items] = await Promise.all([
      getQcTemplateFeedback(key, user.userId),
      listQcTemplateFeedbackByContext(key),
    ]);
    return NextResponse.json({ data, items });
  }
  return NextResponse.json({ data: await listQcTemplateFeedback() });
}, (userId) => authorize({ user: userId, resourceKey: "production.qc.templates", action: "access" }));

export const POST = withAuth(async (request, user) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const parsed = saveFeedbackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const data = parsed.data;
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
}, (userId) => authorize({ user: userId, resourceKey: "production.qc.templates", action: "write" }));

export const PATCH = withAuth(async (request, user) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const parsed = updateFeedbackResolvedSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "缺少反馈 key" }, { status: 400 });
  const data = parsed.data;
  try {
    const item = await updateQcTemplateFeedbackResolved(data.key, data.resolved === true, {
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
}, (userId) => authorize({ user: userId, resourceKey: "production.qc.templates", action: "write" }));
