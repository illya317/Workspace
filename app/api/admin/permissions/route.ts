import { NextResponse } from "next/server";

import { listPermissionResources } from "@workspace/platform/server/permissions";
import {
  authenticate,
  authorize,
  getManageableResourceKeys,
} from "@workspace/platform/server/auth";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const [isSystemAdmin, manageableKeys] = await Promise.all([
    authorize({ user: payload.userId, resourceKey: "system", action: "admin" }),
    getManageableResourceKeys(payload.userId),
  ]);

  if (!isSystemAdmin && manageableKeys.size === 0) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json(
    await listPermissionResources({
      isSystemAdmin,
      manageableResourceKeys: manageableKeys,
    }),
  );
}
