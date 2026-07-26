import { NextResponse } from "next/server";

import { listPermissionResources } from "@workspace/platform/server/permissions";
import { requireAdminApiAccess, isSuperAdmin, getManageableResourceKeys } from "@workspace/platform/server/auth";
import { jsonErrorResponse } from "@workspace/platform/server/api";

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
    await listPermissionResources({
      isSystemAdmin,
      manageableResourceKeys: manageableKeys,
    }),
  );
}
