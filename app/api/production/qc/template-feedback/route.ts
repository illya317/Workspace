import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { checkPermission } from "@/server/rbac/check";
import {
  getQcTemplateFeedback,
  listQcTemplateFeedback,
  saveQcTemplateFeedback,
} from "@/server/services/production/qc";

export const GET = withAuth(async (request, user) => {
  const key = new URL(request.url).searchParams.get("key")?.trim();
  if (key) return NextResponse.json({ data: await getQcTemplateFeedback(key, user.userId) });
  return NextResponse.json({ data: await listQcTemplateFeedback() });
}, (userId) => checkPermission(userId, "production.qc.templates", "access"));

export const POST = withAuth(async (request, user) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  try {
    const item = await saveQcTemplateFeedback(data.context, data.note, {
      userId: user.userId,
      userName: user.name,
    });
    return NextResponse.json({ data: item, keys: (await listQcTemplateFeedback()).keys });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存反馈失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, (userId) => checkPermission(userId, "production.qc.templates", "write"));
