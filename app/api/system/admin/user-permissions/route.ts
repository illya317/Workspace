import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@workspace/platform/server/auth";
import { canManageResourceGrant, setGrant } from "@workspace/platform/server/auth";

const userPermissionSchema = z.object({
  userId: z.coerce.number().int().positive(),
  resourceKey: z.string().trim().min(1),
  roleKey: z.string().trim().min(1),
  value: z.boolean(),
});

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const parsedBody = userPermissionSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "参数错误: 需要 userId, resourceKey, roleKey, value" },
      { status: 400 }
    );
  }

  const { userId, resourceKey, roleKey, value } = parsedBody.data;
  const canManage = await canManageResourceGrant(payload.userId, resourceKey, roleKey);
  if (!canManage) {
    return NextResponse.json({ error: "无权限管理该资源权限" }, { status: 403 });
  }

  try {
    await setGrant("user", userId, resourceKey, roleKey, value, {
      actorUserId: payload.userId,
    });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "操作失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
