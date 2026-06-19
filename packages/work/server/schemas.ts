import { z } from "zod";

export const WorkPlanCreateSchema = z.object({
  name: z.string().min(1, "名称不能为空"),
  description: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  stage: z.string().optional().nullable(),
  plan: z.string().optional().nullable(),
  goal: z.string().optional().nullable(),
  milestones: z.string().optional().nullable(),
  budgetAmount: z.coerce.number().optional().nullable(),
  budgetNote: z.string().optional().nullable(),
  riskNote: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

export async function parseJson<T>(
  request: Request,
  schema: z.ZodSchema<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "请求体必须是合法 JSON" };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, error: first?.message || "参数校验失败" };
  }
  return { ok: true, data: result.data };
}
