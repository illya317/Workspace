import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  getWorkReportDraft,
  saveWorkReport,
  normalizeWorkTargetType,
  type WorkReportItemInput,
} from "@workspace/work/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const saveSchema = z.object({
  targetType: z.string(),
  targetId: z.coerce.number().int().positive(),
  periodStart: z.string().nullable().optional(),
  items: z.array(z.object({
    workItemId: z.coerce.number().int().positive().nullable().optional(),
    title: z.string().nullable().optional(),
    previousPlanSnapshot: z.string().nullable().optional(),
    doneThisWeek: z.string().nullable().optional(),
    planNextWeek: z.string().nullable().optional(),
    sortOrder: z.coerce.number().nullable().optional(),
  })).default([]),
});

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const targetType = normalizeWorkTargetType(searchParams.get("targetType") || "personal");
  const targetId = Number(searchParams.get("targetId") || auth.user.userId);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return jsonErrorResponse("缺少工作空间", 400);
  }

  const result = await getWorkReportDraft({
    userId: auth.user.userId,
    targetType,
    targetId,
    periodStart: searchParams.get("periodStart"),
  });
  if (!result.ok) return jsonErrorResponse(result.error, result.status);
  return NextResponse.json(result.data);
}

export async function PUT(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return jsonErrorResponse("汇报内容格式不正确", 400);

  const result = await saveWorkReport({
    userId: auth.user.userId,
    targetType: normalizeWorkTargetType(parsed.data.targetType),
    targetId: parsed.data.targetId,
    periodStart: parsed.data.periodStart,
    items: parsed.data.items as WorkReportItemInput[],
  });
  if (!result.ok) return jsonErrorResponse(result.error, result.status);
  return NextResponse.json(result.data);
}
