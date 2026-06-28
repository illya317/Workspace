import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { changeUserProfile } from "@workspace/platform/server/account";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const usernameSchema = z.object({
  username: z.string().trim().min(1, "用户名不能为空").max(64, "用户名过长"),
  nickname: z.string().trim().min(1, "昵称不能为空").max(64, "昵称过长"),
});

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await request.json().catch(() => null);
  const parsed = usernameSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErrorResponse(parsed.error.issues[0]?.message || "用户名不能为空", 400);
  }

  const result = await changeUserProfile(user.userId, parsed.data);
  if (!result.success) {
    return jsonErrorResponse(result.error, result.status);
  }

  return NextResponse.json({ success: true });
}
