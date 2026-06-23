import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  deleteProjectPlanPhase,
  projectPlanServiceResponse,
  updateProjectPlanPhase,
} from "@workspace/work/server";

const planPhaseParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  phaseId: z.coerce.number().int().positive(),
});

const planPhaseUpdateBodySchema = z.object({
  sequenceNo: z.coerce.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
}).passthrough();

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; phaseId: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = planPhaseParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "计划阶段 ID 无效" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsedBody = planPhaseUpdateBodySchema.safeParse(body);
  if (!parsedBody.success) return Response.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });

  return projectPlanServiceResponse(await updateProjectPlanPhase({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
    phaseId: parsedParams.data.phaseId,
    body: parsedBody.data,
  }));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; phaseId: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = planPhaseParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "计划阶段 ID 无效" }, { status: 400 });

  return projectPlanServiceResponse(await deleteProjectPlanPhase({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
    phaseId: parsedParams.data.phaseId,
  }));
}
