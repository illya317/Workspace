import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getEditHistorySnapshot,
  listEditHistoryVersions,
} from "@workspace/platform/server/history";
import { authenticate, checkHRAccess } from "@workspace/platform/server/auth";

const editHistoryQuerySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  version: z.coerce.number().int().positive().optional(),
});

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = editHistoryQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少 entityType 或 entityId" }, { status: 400 });
  }

  const { entityType, entityId, version } = parsed.data;
  if (version) {
    const snapshot = await getEditHistorySnapshot(entityType, entityId, version);
    if (!snapshot) {
      return NextResponse.json({ error: "版本不存在" }, { status: 404 });
    }
    return NextResponse.json({ version: snapshot });
  }

  const versions = await listEditHistoryVersions(entityType, entityId);
  return NextResponse.json({ versions });
}
