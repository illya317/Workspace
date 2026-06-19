import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type RouteContext } from "@/lib/with-auth";
import { authorize } from "@workspace/platform/server/auth";
import { deleteQcBatch, getQcBatch, updateQcBatch } from "@workspace/production/server/qc";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
});

const updateQcBatchSchema = z.object({
  batchNumber: z.string().optional(),
  inspector: z.string().optional(),
  fields: z.unknown().optional(),
}).passthrough();

async function parseBatchId(ctx?: RouteContext) {
  const parsed = paramsSchema.safeParse(await ctx?.params);
  return parsed.success ? parsed.data.batchId : null;
}

export const GET = withAuth(async (_request, _user, ctx) => {
  const batchId = await parseBatchId(ctx);
  if (!batchId) return NextResponse.json({ error: "无效批次 ID" }, { status: 400 });
  const batch = await getQcBatch(batchId);
  if (!batch) return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  return NextResponse.json({ data: batch });
}, (userId) => authorize({ user: userId, resourceKey: "production.qc.batches", action: "access" }));

export const PATCH = withAuth(async (request, _user, ctx) => {
  const batchId = await parseBatchId(ctx);
  if (!batchId) return NextResponse.json({ error: "无效批次 ID" }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  const parsed = updateQcBatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const batch = await updateQcBatch(batchId, parsed.data);
  if (!batch) return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  return NextResponse.json({ data: batch });
}, (userId) => authorize({ user: userId, resourceKey: "production.qc.batches", action: "write" }));

export const DELETE = withAuth(async (_request, _user, ctx) => {
  const batchId = await parseBatchId(ctx);
  if (!batchId) return NextResponse.json({ error: "无效批次 ID" }, { status: 400 });
  const deleted = await deleteQcBatch(batchId);
  if (!deleted) return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}, (userId) => authorize({ user: userId, resourceKey: "production.qc.batches", action: "delete" }));
