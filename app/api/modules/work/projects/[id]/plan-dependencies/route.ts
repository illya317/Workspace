import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  projectPlanServiceResponse,
  syncProjectPlanDependencies,
} from "@workspace/work/server";

const projectIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const dependencySchema = z.object({
  predecessorKind: z.enum(["project", "task"]),
  predecessorId: z.coerce.number().int().positive(),
  successorKind: z.enum(["project", "task"]),
  successorId: z.coerce.number().int().positive(),
  lagDays: z.coerce.number().int().optional(),
});

const dependenciesBodySchema = z.object({
  dependencies: z.array(dependencySchema).optional(),
}).passthrough();

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = projectIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "项目 ID 无效" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsedBody = dependenciesBodySchema.safeParse(body);
  if (!parsedBody.success) return Response.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });

  return projectPlanServiceResponse(await syncProjectPlanDependencies({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
