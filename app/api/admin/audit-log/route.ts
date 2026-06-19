import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@workspace/platform/server/auth";
import { getAuditLogDates, getAuditLogEntries } from "@workspace/platform/server/audit-log";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const date = searchParams.get("date") || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50"), 200);

  if (!entityType) return NextResponse.json({ error: "缺少 entityType" }, { status: 400 });

  if (searchParams.get("dates") === "1") {
    const dates = await getAuditLogDates(entityType);
    return NextResponse.json({ dates });
  }

  const result = await getAuditLogEntries(entityType, date, page, pageSize);
  return NextResponse.json(result);
}
