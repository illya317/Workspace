import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, isSuperAdmin } from "@workspace/platform/server/auth";
import { createAdminUser, listAdminUsers } from "@workspace/platform/server/users";

const createAdminUserSchema = z.object({
  name: z.string().trim().min(1),
  username: z.string().trim().optional().nullable(),
});

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await isSuperAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json({ users: await listAdminUsers() });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await isSuperAdmin(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsed = createAdminUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "姓名为必填" }, { status: 400 });

  const user = await createAdminUser(parsed.data);
  return NextResponse.json({ user });
}
