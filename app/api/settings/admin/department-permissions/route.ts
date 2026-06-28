import { NextResponse } from "next/server";
import { z } from "zod";

import {
  listSubjectPermissionGrants,
  setSubjectPermissionGrant,
} from "@workspace/hr/server/permission-grants";
import { requireAdminApiAccess, isSuperAdmin, canManageResourceGrant, getManageableResourceKeys } from "@workspace/platform/server/auth";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const departmentPermissionSchema = z.object({
  departmentId: z.coerce.number().int().positive(),
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
      subjectType: "department",
      isSystemAdmin,
      manageableResourceKeys: manageableKeys,
    }),
  );
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiAccess(request);
    if (!auth.ok) return auth.response;
    const payload = auth.user;

    const parsed = departmentPermissionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonErrorResponse("参数错误: 需要 departmentId, resourceKey, roleKey, value", 400);
    }

    const canManage = await canManageResourceGrant(
      payload.userId,
      parsed.data.resourceKey,
      parsed.data.roleKey,
    );
    if (!canManage) {
      return jsonErrorResponse("无权限管理该资源权限", 403);
    }

    return NextResponse.json(
      await setSubjectPermissionGrant({
        subjectType: "department",
        subjectId: parsed.data.departmentId,
        resourceKey: parsed.data.resourceKey,
        roleKey: parsed.data.roleKey,
        value: parsed.data.value,
        actorUserId: payload.userId,
      }),
    );
  } catch (error: unknown) {
    console.error("department-permissions PUT error:", error);
    return jsonErrorResponse(error instanceof Error ? error.message : "服务器内部错误", 500);
  }
}
