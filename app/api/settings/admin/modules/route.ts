import { NextResponse } from "next/server";
import { z } from "zod";

import { listModuleManagement, setModuleRuntimeEnabled } from "@workspace/platform/server/module-management";
import { authenticate, isSuperAdmin } from "@workspace/platform/server/auth";

const updateModuleSchema = z.object({
  resourceKey: z.string().min(1),
  enabled: z.boolean(),
});

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  if (!(await isSuperAdmin(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  return NextResponse.json(listModuleManagement());
}

export async function PATCH(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  if (!(await isSuperAdmin(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsed = updateModuleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "模块参数无效" }, { status: 400 });

  try {
    return NextResponse.json(await setModuleRuntimeEnabled(parsed.data.resourceKey, parsed.data.enabled));
  } catch (error) {
    const message = error instanceof Error ? error.message : "模块更新失败";
    if (message.startsWith("MODULE_RUNTIME_RESOURCE_NOT_FOUND:")) {
      return NextResponse.json({ error: "模块不存在" }, { status: 404 });
    }
    return NextResponse.json({ error: "模块更新失败" }, { status: 500 });
  }
}
