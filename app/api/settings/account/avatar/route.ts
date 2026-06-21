import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { changeUserAvatar } from "@workspace/platform/server/account";

const avatarSchema = z.object({
  avatar: z.string().trim().max(2048).refine(
    (value) => value.startsWith("/assets/user/avatar/") || /^https?:\/\/.+/i.test(value),
    "请输入有效的图片",
  ).nullable(),
});

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await request.json().catch(() => null);
  const normalized = body && typeof body === "object" && "avatar" in body
    ? { avatar: typeof body.avatar === "string" && body.avatar.trim() === "" ? null : body.avatar }
    : body;
  const parsed = avatarSchema.safeParse(normalized);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "头像地址不正确" },
      { status: 400 },
    );
  }

  const result = await changeUserAvatar(user.userId, parsed.data.avatar);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
