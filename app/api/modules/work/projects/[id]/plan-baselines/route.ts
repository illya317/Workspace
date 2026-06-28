import { z } from "zod";
import { jsonErrorResponse, routeIdParamsSchema } from "@workspace/platform/server/api";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  createProjectPlanBaseline,
  listProjectPlanBaselines,
  projectPlanServiceResponse,
} from "@workspace/work/server";


const baselineBodySchema = z.object({
  name: z.string().optional(),
  note: z.string().nullable().optional(),
}).passthrough();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("项目 ID 无效", 400);

  return projectPlanServiceResponse(await listProjectPlanBaselines({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
  }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("项目 ID 无效", 400);

  const body = await request.json().catch(() => null);
  const parsedBody = baselineBodySchema.safeParse(body);
  if (!parsedBody.success) return jsonErrorResponse(parsedBody.error.issues[0]?.message || "参数错误", 400);

  return projectPlanServiceResponse(await createProjectPlanBaseline({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
