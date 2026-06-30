import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildDeleteWorkPlanCommand,
  executeDeleteWorkPlanCommand,
} from "@workspace/work/server";

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "工作计划 ID 无效",
  buildCommand: ({ user, params }) => buildDeleteWorkPlanCommand({
    userId: user.userId,
    planId: params.id,
  }),
  action: executeDeleteWorkPlanCommand,
});
