import { NextResponse } from "next/server";
import { withAuth, type RouteContext } from "@/lib/with-auth";
import { checkPermission } from "@workspace/platform/server/auth";
import { deleteQcBatch, getQcBatch, updateQcBatch } from "@/server/services/production/qc";

async function parseBatchId(ctx?: RouteContext) {
  const batchId = Number((await ctx?.params)?.batchId);
  return Number.isInteger(batchId) && batchId > 0 ? batchId : null;
}

export const GET = withAuth(async (_request, _user, ctx) => {
  const batchId = await parseBatchId(ctx);
  if (!batchId) return NextResponse.json({ error: "无效批次 ID" }, { status: 400 });
  const batch = await getQcBatch(batchId);
  if (!batch) return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  return NextResponse.json({ data: batch });
}, (userId) => checkPermission(userId, "production.qc.batches", "access"));

export const PATCH = withAuth(async (request, _user, ctx) => {
  const batchId = await parseBatchId(ctx);
  if (!batchId) return NextResponse.json({ error: "无效批次 ID" }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "请求体必须为 JSON" }, { status: 400 });
  const batch = await updateQcBatch(batchId, body as Record<string, unknown>);
  if (!batch) return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  return NextResponse.json({ data: batch });
}, (userId) => checkPermission(userId, "production.qc.batches", "write"));

export const DELETE = withAuth(async (_request, _user, ctx) => {
  const batchId = await parseBatchId(ctx);
  if (!batchId) return NextResponse.json({ error: "无效批次 ID" }, { status: 400 });
  const deleted = await deleteQcBatch(batchId);
  if (!deleted) return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}, (userId) => checkPermission(userId, "production.qc.batches", "delete"));
