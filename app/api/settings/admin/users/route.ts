import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess, isSuperAdmin } from "@workspace/platform/server/auth";
import { createAdminUser, listAdminUsers } from "@workspace/platform/server/users";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const createAdminUserSchema = z.object({
  nickname: z.string().trim().min(1),
  username: z.string().trim().optional().nullable(),
});

export async function GET(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await isSuperAdmin(payload.userId))) {
    return jsonErrorResponse("无权限", 403);
  }

  return NextResponse.json({ users: await listAdminUsers() });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await isSuperAdmin(payload.userId))) {
    return jsonErrorResponse("无权限", 403);
  }

  const parsed = createAdminUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonErrorResponse("昵称为必填", 400);

  const user = await createAdminUser(parsed.data);
  return NextResponse.json({ user });
}
