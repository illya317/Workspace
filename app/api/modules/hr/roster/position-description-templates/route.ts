import { NextResponse } from "next/server";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";
import { z } from "zod";
import { authenticate, checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";
import {
  normalizePositionDescriptionTemplates,
  readPositionDescriptionTemplates,
  writePositionDescriptionTemplates,
} from "@workspace/hr/server";

const updateTemplatesSchema = z.object({
  templates: z.unknown().optional(),
}).passthrough();

export async function GET(request: Request) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const templates = await readPositionDescriptionTemplates();
  return NextResponse.json({ templates });
}

export async function PUT(request: Request) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsedBody = updateTemplatesSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const templates = normalizePositionDescriptionTemplates(parsedBody.data.templates);
  await writePositionDescriptionTemplates(templates);
  return NextResponse.json({ success: true, templates });
}
