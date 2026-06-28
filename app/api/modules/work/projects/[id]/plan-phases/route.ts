import { z } from "zod";

import { createProjectPlanPhase, listProjectPlanPhases } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const planPhaseBodySchema = z.object({
  sequenceNo: z.coerce.number().int().positive().optional(),
  name: z.string().min(1),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
}).passthrough();

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
  }),
  action: listProjectPlanPhases,
});

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  bodySchema: planPhaseBodySchema,
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
    body,
  }),
  action: createProjectPlanPhase,
});
