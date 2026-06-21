import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type RouteContext } from "@workspace/platform/server/with-auth";
import { authorize } from "@workspace/platform/server/auth";
import { submitQcBatch } from "@workspace/production/server/qc";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
});

export const POST = withAuth(async (_request, _user, ctx?: RouteContext) => {
  const parsed = paramsSchema.safeParse(await ctx?.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "无效批次 ID" }, { status: 400 });
  }
  const batch = await submitQcBatch(parsed.data.batchId);
  if (!batch) return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  return NextResponse.json({ data: batch });
}, (userId) => authorize({ user: userId, resourceKey: "production.qc.batches", action: "write" }));
