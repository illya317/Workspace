import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  createProjectPlanPhase,
  listProjectPlanPhases,
  projectPlanServiceResponse,
} from "@workspace/work/server";


const planPhaseBodySchema = z.object({
  sequenceNo: z.coerce.number().int().positive().optional(),
  name: z.string().min(1),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
}).passthrough();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "项目 ID 无效" }, { status: 400 });

  return projectPlanServiceResponse(await listProjectPlanPhases({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
  }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "项目 ID 无效" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsedBody = planPhaseBodySchema.safeParse(body);
  if (!parsedBody.success) return Response.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });

  return projectPlanServiceResponse(await createProjectPlanPhase({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
