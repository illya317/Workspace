import { NextResponse } from "next/server";
import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  archiveWorkPlan,
  canDeleteWorkTask,
  canEditWorkTask,
  getWorkPlanAccessMetadata,
  updateWorkPlan,
} from "@workspace/work/server";

const updateWorkPlanSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  ownerEmployeeId: z.coerce.number().nullable().optional(),
  periodType: z.string().nullable().optional(),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  sourceType: z.string().optional(),
  sourceKind: z.string().nullable().optional(),
  sourceMeetingId: z.coerce.number().nullable().optional(),
  sourceMeetingDecisionId: z.coerce.number().nullable().optional(),
  sourceMeetingActionCandidateId: z.coerce.number().nullable().optional(),
  linkedProjectId: z.coerce.number().nullable().optional(),
  linkedProjectPhaseId: z.coerce.number().nullable().optional(),
  linkedProjectTaskId: z.coerce.number().nullable().optional(),
  sortOrder: z.coerce.number().optional(),
}).passthrough();

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "工作计划 ID 无效" }, { status: 400 });
  const planId = parsedParams.data.id;
  const existing = await getWorkPlanAccessMetadata(planId);
  if (!existing) return NextResponse.json({ error: "工作计划不存在" }, { status: 404 });
  const allowed = await canEditWorkTask(payload.userId, existing.targetType, existing.targetId);
  if (!allowed) return NextResponse.json({ error: "无权限编辑工作计划" }, { status: 403 });

  const parsedBody = updateWorkPlanSchema.safeParse(await request.json());
  if (!parsedBody.success) return NextResponse.json({ error: "工作计划参数无效" }, { status: 400 });
  const plan = await updateWorkPlan(planId, parsedBody.data);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status || 400 });
  return NextResponse.json({ plan: plan.data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "工作计划 ID 无效" }, { status: 400 });
  const planId = parsedParams.data.id;
  const existing = await getWorkPlanAccessMetadata(planId);
  if (!existing) return NextResponse.json({ error: "工作计划不存在" }, { status: 404 });
  const allowed = await canDeleteWorkTask(payload.userId, existing.targetType, existing.targetId);
  if (!allowed) return NextResponse.json({ error: "无权限删除工作计划" }, { status: 403 });
  const result = await archiveWorkPlan(planId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  return NextResponse.json({ success: true });
}
