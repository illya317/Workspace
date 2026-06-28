import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { jsonErrorResponse, routeIdParamsSchema } from "@workspace/platform/server/api";
import {
  canEditWorkTask,
  canDeleteWorkTask,
  deleteWorkItem,
  getWorkItemAccessMetadata,
  parseParticipants,
  updateWorkItem,
} from "@workspace/work/server";

const updateWorkItemSchema = z.object({
  planId: z.coerce.number().nullable().optional(),
  category: z.string().optional(),
  itemType: z.string().optional(),
  content: z.string().optional(),
  description: z.string().optional(),
  importance: z.coerce.number().int().optional(),
  urgency: z.coerce.number().int().optional(),
  status: z.string().nullable().optional(),
  krStartValue: z.coerce.number().nullable().optional(),
  krTargetValue: z.coerce.number().nullable().optional(),
  krCurrentValue: z.coerce.number().nullable().optional(),
  krUnit: z.string().nullable().optional(),
  ownerEmployeeId: z.coerce.number().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
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
  parentWorkItemId: z.coerce.number().nullable().optional(),
  participants: z.string().optional(),
  sortOrder: z.coerce.number().int().optional(),
  isArchived: z.boolean().optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return jsonErrorResponse("节点 ID 无效", 400);
  }

  const workId = parsedParams.data.id;
  const existing = await getWorkItemAccessMetadata(workId);
  if (!existing) return jsonErrorResponse("节点不存在", 404);

  const allowed = await canEditWorkTask(payload.userId, existing.targetType, existing.targetId ?? 0);
  if (!allowed) return jsonErrorResponse("无权限编辑工作计划", 403);

  const parsedBody = updateWorkItemSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return jsonErrorResponse("节点参数无效", 400);
  }

  const { participants, ...data } = parsedBody.data;
  const work = await updateWorkItem(workId, {
    ...data,
    ...(participants !== undefined && { participants: parseParticipants(participants) }),
  });
  if (!work.ok) return jsonErrorResponse(work.error, work.status || 400);
  return NextResponse.json({ work: work.data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return jsonErrorResponse("节点 ID 无效", 400);
  }

  const workId = parsedParams.data.id;
  const existing = await getWorkItemAccessMetadata(workId);
  if (!existing) return jsonErrorResponse("节点不存在", 404);

  const allowed = await canDeleteWorkTask(payload.userId, existing.targetType, existing.targetId ?? 0);
  if (!allowed) return jsonErrorResponse("无权限删除工作计划", 403);

  const result = await deleteWorkItem(workId);
  if (!result.ok) return jsonErrorResponse(result.error, result.status || 400);
  return NextResponse.json({ success: true });
}
