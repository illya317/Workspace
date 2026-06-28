import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess, checkHRWrite } from "@workspace/platform/server/auth";
import { restoreAuditLogSnapshot } from "@workspace/platform/server/audit-log";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const restoreBodySchema = z.object({
  historyId: z.coerce.number().int().positive(),
});

export async function POST(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const parsed = restoreBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonErrorResponse("缺少 historyId", 400);

  const result = await restoreAuditLogSnapshot(parsed.data.historyId);
  if (!result.success) return jsonErrorResponse(result.error, result.status);
  return NextResponse.json(result);
}
