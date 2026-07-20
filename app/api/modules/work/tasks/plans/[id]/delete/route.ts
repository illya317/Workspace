import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildDeleteWorkPlanCommand,
  executeDeleteWorkPlanCommand,
  workImpactCommandBodySchema,
} from "@workspace/work/server";

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: workImpactCommandBodySchema,
  paramsError: "工作计划 ID 无效",
  buildCommand: ({ user, params, body }) => buildDeleteWorkPlanCommand({
    userId: user.userId,
    planId: params.id,
    impactResolution: body.impactResolution,
  }),
  action: executeDeleteWorkPlanCommand,
});
