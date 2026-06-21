import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess, checkHRWrite } from "@workspace/platform/server/auth";
import { restoreAuditLogSnapshot } from "@workspace/platform/server/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const restoreBodySchema = z.object({
  historyId: z.coerce.number().int().positive(),
});

export async function POST(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsed = restoreBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "缺少 historyId" }, { status: 400 });

  const result = await restoreAuditLogSnapshot(parsed.data.historyId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
