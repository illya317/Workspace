import { NextResponse } from "next/server";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { listWorkReportCollection } from "@workspace/work/server";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const result = await listWorkReportCollection({
    userId: auth.user.userId,
    periodStart: searchParams.get("periodStart"),
  });
  return NextResponse.json(result.data);
}
