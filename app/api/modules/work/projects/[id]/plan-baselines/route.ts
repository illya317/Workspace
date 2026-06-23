import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  createProjectPlanBaseline,
  listProjectPlanBaselines,
  projectPlanServiceResponse,
} from "@workspace/work/server";

const projectIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const baselineBodySchema = z.object({
  name: z.string().optional(),
  note: z.string().nullable().optional(),
}).passthrough();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = projectIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "项目 ID 无效" }, { status: 400 });

  return projectPlanServiceResponse(await listProjectPlanBaselines({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
  }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsedParams = projectIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return Response.json({ error: "项目 ID 无效" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsedBody = baselineBodySchema.safeParse(body);
  if (!parsedBody.success) return Response.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });

  return projectPlanServiceResponse(await createProjectPlanBaseline({
    userId: auth.user.userId,
    projectId: parsedParams.data.id,
    body: parsedBody.data,
  }));
}
