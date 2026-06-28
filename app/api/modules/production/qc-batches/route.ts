import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@workspace/platform/server/with-auth";
import { createQcBatch, listQcBatches } from "@workspace/production/server/qc";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const createQcBatchSchema = z.object({
  productKey: z.coerce.string().trim().min(1),
  batchNumber: z.coerce.string().trim().min(1),
});

export const GET = withAuth(async () => {
  return NextResponse.json({ data: await listQcBatches() });
});

export const POST = withAuth(async (request) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonErrorResponse("请求体必须为 JSON", 400);
  }
  const parsed = createQcBatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErrorResponse("productKey and batchNumber are required", 400);
  }

  try {
    const batch = await createQcBatch(parsed.data);
    return NextResponse.json({ data: batch }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建批次失败";
    return jsonErrorResponse(message, 400);
  }
});
