import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess, isSuperAdmin } from "@workspace/platform/server/auth";
import {
  getSystemConfig,
  updateSystemConfig,
} from "@workspace/platform/server/system-config";

const systemConfigSchema = z.object({
  conflictStrategy: z.enum(["union", "deny_override"]).optional(),
});

export async function GET(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  if (!(await isSuperAdmin(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  return NextResponse.json(await getSystemConfig());
}

export async function PUT(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  if (!(await isSuperAdmin(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsed = systemConfigSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "配置参数无效" }, { status: 400 });
  }

  return NextResponse.json(await updateSystemConfig(parsed.data));
}
