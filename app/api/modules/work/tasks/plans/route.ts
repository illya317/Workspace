import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  canAccessTarget,
  canEditWorkTask,
  createWorkPlan,
  listWorkPlans,
} from "@workspace/work/server";

const workPlanSchema = z.object({
  kind: z.string().optional(),
  title: z.string().min(1),
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
  targetType: z.string().optional(),
  targetId: z.coerce.number().optional(),
  deptId: z.coerce.number().optional(),
}).passthrough();

function resolveTarget(input: { targetType?: string | null; targetId?: number | null; deptId?: number | null }, user: { userId: number; departmentId: number }) {
  const targetType = input.targetType || "department";
  const targetId = targetType === "personal" || targetType === "user"
    ? input.targetId ?? user.userId
    : input.targetId ?? (targetType === "department" ? input.deptId : null) ?? user.departmentId;
  return {
    targetType: targetType === "user" ? "personal" : targetType,
    targetId,
  };
}

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const { searchParams } = new URL(request.url);
  const target = resolveTarget({
    targetType: searchParams.get("targetType"),
    targetId: searchParams.get("targetId") ? Number(searchParams.get("targetId")) : null,
    deptId: searchParams.get("deptId") ? Number(searchParams.get("deptId")) : null,
  }, payload);
  const allowed = await canAccessTarget(payload.userId, target.targetType, target.targetId);
  if (!allowed) return NextResponse.json({ error: "无权限访问该目标" }, { status: 403 });

  const plans = await listWorkPlans({
    ...target,
    kind: searchParams.get("kind") || "okr",
    includeArchived: searchParams.get("includeArchived") === "true",
  });
  return NextResponse.json({ plans });
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const body = await request.json().catch(() => null);
  const parsed = workPlanSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "工作计划参数无效" }, { status: 400 });
  const { targetType, targetId, deptId, ...planInput } = parsed.data;
  const target = resolveTarget({ targetType, targetId, deptId }, payload);
  const allowed = await canEditWorkTask(payload.userId, target.targetType, target.targetId);
  if (!allowed) return NextResponse.json({ error: "无权限编辑工作计划" }, { status: 403 });

  const plan = await createWorkPlan({
    ...target,
    ...planInput,
  });
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status || 400 });
  return NextResponse.json({ plan: plan.data });
}
