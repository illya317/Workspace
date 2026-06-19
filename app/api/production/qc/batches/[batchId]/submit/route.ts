import { NextResponse } from "next/server";
import { withAuth, type RouteContext } from "@/lib/with-auth";
import { checkPermission } from "@workspace/platform/server/auth";
import { submitQcBatch } from "@/server/services/production/qc";

export const POST = withAuth(async (_request, _user, ctx?: RouteContext) => {
  const batchId = Number((await ctx?.params)?.batchId);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    return NextResponse.json({ error: "无效批次 ID" }, { status: 400 });
  }
  const batch = await submitQcBatch(batchId);
  if (!batch) return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  return NextResponse.json({ data: batch });
}, (userId) => checkPermission(userId, "production.qc.batches", "write"));
