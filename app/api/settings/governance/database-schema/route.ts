import { NextResponse } from "next/server";

import { jsonErrorResponse } from "@workspace/platform/server/api";
import { isSuperAdmin, requireApiAccess } from "@workspace/platform/server/auth";
import { listDatabaseSchemaCatalog } from "@workspace/settings/server/database-catalog";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  if (!(await isSuperAdmin(auth.user.userId))) return jsonErrorResponse("无权限", 403);

  try {
    return NextResponse.json(await listDatabaseSchemaCatalog());
  } catch (error) {
    console.error("database schema catalog load failed", error);
    return jsonErrorResponse("加载数据关系失败", 500);
  }
}
