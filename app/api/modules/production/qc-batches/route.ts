import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@workspace/platform/server/with-auth";
import { createQcBatch, listQcBatches } from "@workspace/production/server/qc";

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
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const parsed = createQcBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "productKey and batchNumber are required" }, { status: 400 });
  }

  try {
    const batch = await createQcBatch(parsed.data);
    return NextResponse.json({ data: batch }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建批次失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
