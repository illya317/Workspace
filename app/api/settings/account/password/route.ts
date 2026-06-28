import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { changeUserPassword } from "@workspace/platform/server/account";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(4, "新密码至少4位"),
});

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErrorResponse(parsed.error.issues[0]?.message || "旧密码和新密码不能为空", 400);
  }

  const result = await changeUserPassword(
    user.userId,
    parsed.data.oldPassword,
    parsed.data.newPassword,
  );
  if (!result.success) {
    return jsonErrorResponse(result.error, result.status);
  }

  return NextResponse.json({ success: true });
}
