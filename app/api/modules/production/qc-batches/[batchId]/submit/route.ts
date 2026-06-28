import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type RouteContext } from "@workspace/platform/server/with-auth";
import { submitQcBatch } from "@workspace/production/server/qc";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
});

export const POST = withAuth(async (_request, _user, ctx?: RouteContext) => {
  const parsed = paramsSchema.safeParse(await ctx?.params);
  if (!parsed.success) {
    return jsonErrorResponse("无效批次 ID", 400);
  }
  const batch = await submitQcBatch(parsed.data.batchId);
  if (!batch) return jsonErrorResponse("批次不存在", 404);
  return NextResponse.json({ data: batch });
});
