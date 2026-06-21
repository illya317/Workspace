import { NextResponse } from "next/server";

import { listPermissionResources } from "@workspace/platform/server/permissions";
import { requireAdminApiAccess, isSuperAdmin, getManageableResourceKeys } from "@workspace/platform/server/auth";

export async function GET(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const [isSystemAdmin, manageableKeys] = await Promise.all([
    isSuperAdmin(payload.userId),
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
