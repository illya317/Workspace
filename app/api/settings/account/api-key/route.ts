import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { getUserApiKey, rotateUserApiKey } from "@workspace/platform/server/user-preferences";

const rotateApiKeySchema = z.object({}).passthrough();

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const apiKey = await getUserApiKey(payload.userId);
  return NextResponse.json({ apiKey });
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const body = await request.json().catch(() => ({}));
  const parsed = rotateApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const apiKey = await rotateUserApiKey(payload.userId);
  return NextResponse.json({ apiKey });
}
