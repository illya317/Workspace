import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess, isSuperAdmin } from "@workspace/platform/server/auth";
import { createAdminUser, listAdminUsers } from "@workspace/platform/server/users";

const createAdminUserSchema = z.object({
  nickname: z.string().trim().min(1),
  username: z.string().trim().optional().nullable(),
});

export async function GET(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await isSuperAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json({ users: await listAdminUsers() });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await isSuperAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsed = createAdminUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "昵称为必填" }, { status: 400 });

  const user = await createAdminUser(parsed.data);
  return NextResponse.json({ user });
}
