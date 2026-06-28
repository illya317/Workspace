import { NextResponse } from "next/server";
import { z } from "zod";

import { listModuleManagement, setModuleRuntimeEnabled } from "@workspace/platform/server/module-management";
import { requireAdminApiAccess, isSuperAdmin } from "@workspace/platform/server/auth";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const updateModuleSchema = z.object({
  resourceKey: z.string().min(1),
  enabled: z.boolean(),
});

export async function GET(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  if (!(await isSuperAdmin(payload.userId))) return jsonErrorResponse("无权限", 403);

  return NextResponse.json(listModuleManagement());
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  if (!(await isSuperAdmin(payload.userId))) return jsonErrorResponse("无权限", 403);

  const parsed = updateModuleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonErrorResponse("模块参数无效", 400);

  try {
    return NextResponse.json(await setModuleRuntimeEnabled(parsed.data.resourceKey, parsed.data.enabled));
  } catch (error) {
    const message = error instanceof Error ? error.message : "模块更新失败";
    if (message.startsWith("MODULE_RUNTIME_RESOURCE_NOT_FOUND:")) {
      return jsonErrorResponse("模块不存在", 404);
    }
    return jsonErrorResponse("模块更新失败", 500);
  }
}
