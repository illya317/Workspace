import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  activateProjectPlanBaseline,
  projectPlanServiceResponse,
} from "@workspace/work/server";

const baselineParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  baselineId: z.coerce.number().int().positive(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string; baselineId: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = baselineParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "基准 ID 无效" }, { status: 400 });

  return projectPlanServiceResponse(await activateProjectPlanBaseline({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
    baselineId: parsedParams.data.baselineId,
  }));
}
