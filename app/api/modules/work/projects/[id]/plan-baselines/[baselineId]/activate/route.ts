import { z } from "zod";

import { activateProjectPlanBaseline } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const baselineParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  baselineId: z.coerce.number().int().positive(),
});

export const POST = createCommandRoute({
  paramsSchema: baselineParamsSchema,
  paramsError: "基准 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
    baselineId: params.baselineId,
  }),
  action: activateProjectPlanBaseline,
});
