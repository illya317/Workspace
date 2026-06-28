import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess, checkHRAccess } from "@workspace/platform/server/auth";
import { getAuditLogDates, getAuditLogEntries } from "@workspace/platform/server/audit-log";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { isHrAuditEntityType } from "@workspace/hr/server/audit-entities";

const auditLogQuerySchema = z.object({
  entityType: z.string().min(1),
  date: z.string().optional(),
  dates: z.string().optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(200).catch(50),
});

export async function GET(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await checkHRAccess(payload.userId, "access", "hr.roster"))) return jsonErrorResponse("无权限", 403);

  const { searchParams } = new URL(request.url);
  const parsed = auditLogQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return jsonErrorResponse("缺少 entityType", 400);
  if (!isHrAuditEntityType(parsed.data.entityType)) return jsonErrorResponse("无权限", 403);

  if (parsed.data.dates === "1") {
    const dates = await getAuditLogDates(parsed.data.entityType);
    return NextResponse.json({ dates });
  }

  const result = await getAuditLogEntries(
    parsed.data.entityType,
    parsed.data.date,
    parsed.data.page,
    parsed.data.pageSize,
  );
  return NextResponse.json(result);
}
