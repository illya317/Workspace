import { NextResponse } from "next/server";
import { requireApiAccess, isSuperAdmin } from "@workspace/platform/server/auth";
import { searchEmployeesForAccountLink } from "@workspace/hr/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  if (!(await isSuperAdmin(payload.userId))) {
    return jsonErrorResponse("无权限", 403);
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  return NextResponse.json({ items: await searchEmployeesForAccountLink(q) });
}
