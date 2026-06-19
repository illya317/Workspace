import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { checkPermission } from "@workspace/platform/server/auth";
import { createQcBatch, listQcBatches } from "@/server/services/production/qc";

export const GET = withAuth(async () => {
  return NextResponse.json({ data: await listQcBatches() });
}, (userId) => checkPermission(userId, "production.qc.batches", "access"));

export const POST = withAuth(async (request) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  try {
    const batch = await createQcBatch({
      productKey: String(data.productKey ?? ""),
      batchNumber: String(data.batchNumber ?? ""),
    });
    return NextResponse.json({ data: batch }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建批次失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, (userId) => checkPermission(userId, "production.qc.batches", "write"));
