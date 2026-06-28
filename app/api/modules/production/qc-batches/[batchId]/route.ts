import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type RouteContext } from "@workspace/platform/server/with-auth";
import { getUserEmployeeSignatureName } from "@workspace/platform/server/user-identity";
import { deleteQcBatch, getQcBatch, updateQcBatch, updateQcBatchWorkflow } from "@workspace/production/server/qc";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
});

const updateQcBatchSchema = z.object({
  action: z.enum(["save_inspection", "approve_review"]).optional(),
  stageKey: z.string().optional(),
  testName: z.string().optional(),
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
  if (!batchId) return jsonErrorResponse("无效批次 ID", 400);
  const batch = await getQcBatch(batchId);
  if (!batch) return jsonErrorResponse("批次不存在", 404);
  return NextResponse.json({ data: batch });
});

export const PATCH = withAuth(async (request, user, ctx) => {
  const batchId = await parseBatchId(ctx);
  if (!batchId) return jsonErrorResponse("无效批次 ID", 400);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonErrorResponse("请求体必须为 JSON", 400);
  const parsed = updateQcBatchSchema.safeParse(body);
  if (!parsed.success) return jsonErrorResponse("参数错误", 400);
  try {
    if (parsed.data.action) {
      if (!parsed.data.stageKey || !parsed.data.testName) {
        return jsonErrorResponse("缺少检验项目信息", 400);
      }
      const rawFields = parsed.data.fields;
      const fields = rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)
        ? rawFields as Record<string, unknown>
        : undefined;
      const actorName = await getUserEmployeeSignatureName(user.userId, user.nickname);
      const batch = await updateQcBatchWorkflow(batchId, {
        action: parsed.data.action,
        stageKey: parsed.data.stageKey,
        testName: parsed.data.testName,
        actorName,
        fields,
      });
      if (!batch) return jsonErrorResponse("批次不存在", 404);
      return NextResponse.json({ data: batch });
    }
    if (parsed.data.fields) {
      return jsonErrorResponse("检验数据更新必须声明动作", 400);
    }
    const batch = await updateQcBatch(batchId, parsed.data);
    if (!batch) return jsonErrorResponse("批次不存在", 404);
    return NextResponse.json({ data: batch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "批次更新失败";
    return jsonErrorResponse(message, 400);
  }
});

export const DELETE = withAuth(async (_request, _user, ctx) => {
  const batchId = await parseBatchId(ctx);
  if (!batchId) return jsonErrorResponse("无效批次 ID", 400);
  const deleted = await deleteQcBatch(batchId);
  if (!deleted) return jsonErrorResponse("批次不存在", 404);
  return NextResponse.json({ ok: true });
});
