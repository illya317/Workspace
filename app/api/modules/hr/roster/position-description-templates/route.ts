import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess, checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";
import {
  normalizePositionDescriptionTemplates,
  readPositionDescriptionTemplates,
  writePositionDescriptionTemplates,
} from "@workspace/hr/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const updateTemplatesSchema = z.object({
  templates: z.unknown().optional(),
}).passthrough();

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) {
    return jsonErrorResponse("无权限", 403);
  }

  const templates = await readPositionDescriptionTemplates();
  return NextResponse.json({ templates });
}

export async function PUT(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) {
    return jsonErrorResponse("无权限", 403);
  }

  const body = await request.json().catch(() => ({}));
  const parsedBody = updateTemplatesSchema.safeParse(body);
  if (!parsedBody.success) return jsonErrorResponse("参数错误", 400);
  const templates = normalizePositionDescriptionTemplates(parsedBody.data.templates);
  await writePositionDescriptionTemplates(templates);
  return NextResponse.json({ success: true, templates });
}
