import { NextResponse } from "next/server";
import { z } from "zod";
import { restoreAuditLogSnapshot } from "@workspace/platform/server/audit-log";
import { authenticate, checkHRWrite } from "@workspace/platform/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const restoreBodySchema = z.object({
  historyId: z.coerce.number().int().positive(),
});

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsed = restoreBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 historyId" }, { status: 400 });

  const result = await restoreAuditLogSnapshot(parsed.data.historyId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
