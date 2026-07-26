import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { buildKpiPlanCommand, executeGetKpiResultsCommand } from "@workspace/work/server";

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "OKR 计划 ID 无效",
  buildCommand: ({ user, params }) => buildKpiPlanCommand({ userId: user.userId, planId: params.id }),
  action: executeGetKpiResultsCommand,
});
