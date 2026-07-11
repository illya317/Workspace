import {
  buildFinanceRouteIdCommand,
  executeDeleteReclassRuleRouteCommand,
} from "@workspace/finance/server/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "无效的规则 ID",
  buildCommand: ({ params }) => buildFinanceRouteIdCommand(params.id),
  action: executeDeleteReclassRuleRouteCommand,
});
