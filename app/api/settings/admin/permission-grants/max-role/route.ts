import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiAccess, isSuperAdmin } from "@workspace/platform/server/auth";
import { updateResourceMaxRole } from "@workspace/platform/server/permissions";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const updateMaxRoleSchema = z.object({
  resourceKey: z.string().min(1),
  maxRoleKey: z.string().min(1),
});

export async function PATCH(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const isSystemAdmin = await isSuperAdmin(payload.userId);
  if (!isSystemAdmin) return jsonErrorResponse("仅系统管理员可修改", 403);

  const parsed = updateMaxRoleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonErrorResponse("缺少参数", 400);

  const result = await updateResourceMaxRole(parsed.data.resourceKey, parsed.data.maxRoleKey);
  if (!result.success) return jsonErrorResponse(result.error, result.status);
  return NextResponse.json(result);
}
