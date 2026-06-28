import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess, canManageResourceGrant, setGrant } from "@workspace/platform/server/auth";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const userPermissionSchema = z.object({
  userId: z.coerce.number().int().positive(),
  resourceKey: z.string().trim().min(1),
  roleKey: z.string().trim().min(1),
  value: z.boolean(),
});

export async function PUT(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const parsedBody = userPermissionSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return jsonErrorResponse("参数错误: 需要 userId, resourceKey, roleKey, value", 400);
  }

  const { userId, resourceKey, roleKey, value } = parsedBody.data;
  const canManage = await canManageResourceGrant(payload.userId, resourceKey, roleKey);
  if (!canManage) {
    return jsonErrorResponse("无权限管理该资源权限", 403);
  }

  try {
    await setGrant("user", userId, resourceKey, roleKey, value, {
      actorUserId: payload.userId,
    });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "操作失败";
    return jsonErrorResponse(msg, 400);
  }
}
