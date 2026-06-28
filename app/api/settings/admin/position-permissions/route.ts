import { NextResponse } from "next/server";
import { z } from "zod";

import {
  listSubjectPermissionGrants,
  setSubjectPermissionGrant,
} from "@workspace/hr/server/permission-grants";
import { requireAdminApiAccess, isSuperAdmin, canManageResourceGrant, getManageableResourceKeys } from "@workspace/platform/server/auth";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const positionPermissionSchema = z.object({
  positionId: z.coerce.number().int().positive(),
  resourceKey: z.string().min(1),
  roleKey: z.string().min(1),
  value: z.boolean(),
});

export async function GET(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const [isSystemAdmin, manageableKeys] = await Promise.all([
    isSuperAdmin(payload.userId),
    getManageableResourceKeys(payload.userId),
  ]);

  if (!isSystemAdmin && manageableKeys.size === 0) {
    return jsonErrorResponse("无权限", 403);
  }

  return NextResponse.json(
    await listSubjectPermissionGrants({
      subjectType: "position",
      isSystemAdmin,
      manageableResourceKeys: manageableKeys,
    }),
  );
}

export async function PUT(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const parsed = positionPermissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonErrorResponse("参数错误: 需要 positionId, resourceKey, roleKey, value", 400);
  }

  const canManage = await canManageResourceGrant(
    payload.userId,
    parsed.data.resourceKey,
    parsed.data.roleKey,
  );
  if (!canManage) {
    return jsonErrorResponse("无权限管理该资源权限", 403);
  }

  try {
    return NextResponse.json(
      await setSubjectPermissionGrant({
        subjectType: "position",
        subjectId: parsed.data.positionId,
        resourceKey: parsed.data.resourceKey,
        roleKey: parsed.data.roleKey,
        value: parsed.data.value,
        actorUserId: payload.userId,
      }),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "操作失败";
    return jsonErrorResponse(message, 400);
  }
}
