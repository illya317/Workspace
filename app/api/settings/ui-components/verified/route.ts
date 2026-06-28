import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, requireApiAccess } from "@workspace/platform/server/auth";
import {
  readUiComponentVerifiedNames,
  toggleUiComponentVerified,
} from "@workspace/core/server/ui-component-verified-store";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const ADMIN_RESOURCE = "settings.admin";
const toggleSchema = z.object({
  name: z.string().min(1),
});

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const canWrite = await authorize({
    user: auth.user.userId,
    resourceKey: ADMIN_RESOURCE,
    action: "write",
  });
  const names = await readUiComponentVerifiedNames();
  return NextResponse.json({ verified: Array.from(names), canWrite });
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErrorResponse("参数错误", 400);
  }

  const verified = await toggleUiComponentVerified(parsed.data.name);
  return NextResponse.json({ success: true, name: parsed.data.name, verified });
}
