import { NextResponse } from "next/server";
import { z } from "zod";

import {
  listSubjectPermissionGrants,
  setSubjectPermissionGrant,
} from "@workspace/hr/server/permission-grants";
import {
  authenticate,
  isSuperAdmin,
  canManageResourceGrant,
  getManageableResourceKeys,
} from "@workspace/platform/server/auth";

const positionPermissionSchema = z.object({
  positionId: z.coerce.number().int().positive(),
  resourceKey: z.string().min(1),
  roleKey: z.string().min(1),
  value: z.boolean(),
});

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const [isSystemAdmin, manageableKeys] = await Promise.all([
    isSuperAdmin(payload.userId),
    getManageableResourceKeys(payload.userId),
  ]);

  if (!isSystemAdmin && manageableKeys.size === 0) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
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
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const parsed = positionPermissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误: 需要 positionId, resourceKey, roleKey, value" },
      { status: 400 },
    );
  }

  const canManage = await canManageResourceGrant(
    payload.userId,
    parsed.data.resourceKey,
    parsed.data.roleKey,
  );
  if (!canManage) {
    return NextResponse.json({ error: "无权限管理该资源权限" }, { status: 403 });
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
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
