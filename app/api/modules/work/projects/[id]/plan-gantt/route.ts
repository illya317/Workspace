import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  listProjectPlanGantt,
  projectPlanServiceResponse,
  saveProjectPlanGantt,
} from "@workspace/work/server";


const planItemBodySchema = z.object({
  kind: z.enum(["project", "task"]),
  id: z.coerce.number().int().positive(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  phaseId: z.coerce.number().int().positive().nullable().optional(),
});

const savePlanBodySchema = z.object({
  items: z.array(planItemBodySchema).optional(),
}).passthrough();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "项目 ID 无效" }, { status: 400 });

  return projectPlanServiceResponse(await listProjectPlanGantt({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
  }));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "项目 ID 无效" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsedBody = savePlanBodySchema.safeParse(body);
  if (!parsedBody.success) return Response.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });

  return projectPlanServiceResponse(await saveProjectPlanGantt({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
