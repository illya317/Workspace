import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  deleteProjectTask,
  projectTaskServiceResponse,
  updateProjectTask,
} from "@workspace/work/server";

const projectTaskParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  taskId: z.coerce.number().int().positive(),
});

const projectTaskUpdateBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isMilestone: z.boolean().optional(),
  ownerEmployeeId: z.coerce.number().int().positive().nullable().optional(),
  baselineStartDate: z.string().nullable().optional(),
  baselineEndDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  predecessorTaskIds: z.array(z.coerce.number().int().positive()).optional(),
  planPhaseId: z.coerce.number().int().positive().nullable().optional(),
  sourceMeetingDecisionId: z.coerce.number().int().positive().nullable().optional(),
  sourceMeetingActionCandidateId: z.coerce.number().int().positive().nullable().optional(),
  assignees: z.array(z.object({
    employeeId: z.coerce.number().int().positive(),
    role: z.string().nullable().optional(),
  })).optional(),
  sortOrder: z.coerce.number().int().optional(),
}).passthrough();

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = projectTaskParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "任务 ID 无效" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsedBody = projectTaskUpdateBodySchema.safeParse(body);
  if (!parsedBody.success) return Response.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });

  return projectTaskServiceResponse(await updateProjectTask({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
    taskId: parsedParams.data.taskId,
    body: parsedBody.data,
  }));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = projectTaskParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "任务 ID 无效" }, { status: 400 });

  return projectTaskServiceResponse(await deleteProjectTask({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
    taskId: parsedParams.data.taskId,
  }));
}
