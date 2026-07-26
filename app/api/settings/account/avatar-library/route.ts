import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { listAccountAvatars, uploadAccountAvatar } from "@workspace/platform/server/account-avatar-library";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const avatarUploadSchema = z.instanceof(File);

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json({ avatars: await listAccountAvatars() });
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const parsedFile = avatarUploadSchema.safeParse(file);
  if (!parsedFile.success) {
    return jsonErrorResponse("请选择头像文件", 400);
  }

  const result = await uploadAccountAvatar(parsedFile.data, user.userId);
  if (!result.success) {
    return jsonErrorResponse(result.error, result.status);
  }

  return NextResponse.json({ avatar: result.item });
}
