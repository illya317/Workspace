import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, requireApiAccess } from "@workspace/platform/server/auth";
import { getUserApiKey, rotateUserApiKey } from "@workspace/platform/server/user-preferences";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const rotateApiKeySchema = z.object({}).passthrough();

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await authorize({ user: payload.userId, resourceKey: "settings.account.apiAccess", action: "access" }))) {
    return jsonErrorResponse("无权限", 403);
  }

  const apiKey = await getUserApiKey(payload.userId);
  return NextResponse.json({ apiKey });
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await authorize({ user: payload.userId, resourceKey: "settings.account.apiAccess", action: "access" }))) {
    return jsonErrorResponse("无权限", 403);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = rotateApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return jsonErrorResponse("参数错误", 400);
  }

  const apiKey = await rotateUserApiKey(payload.userId);
  return NextResponse.json({ apiKey });
}
