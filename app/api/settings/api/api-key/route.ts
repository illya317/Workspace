import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authorize } from "@workspace/platform/server/auth";
import { getUserApiKey, rotateUserApiKey } from "@workspace/platform/server/user-preferences";

const rotateApiKeySchema = z.object({}).passthrough();

async function requireApiAccess(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return null;
  const allowed = await authorize({
    user: payload.userId,
    resourceKey: "settings.api",
    action: "access",
  });
  return allowed ? payload : null;
}

export async function GET(request: Request) {
  const payload = await requireApiAccess(request);
  if (!payload) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const apiKey = await getUserApiKey(payload.userId);
  return NextResponse.json({ apiKey });
}

export async function POST(request: Request) {
  const payload = await requireApiAccess(request);
  if (!payload) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = rotateApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const apiKey = await rotateUserApiKey(payload.userId);
  return NextResponse.json({ apiKey });
}
