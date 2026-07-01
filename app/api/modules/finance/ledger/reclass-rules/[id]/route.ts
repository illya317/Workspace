import {
  buildFinanceRouteIdCommand,
  executeDeleteReclassRuleRouteCommand,
} from "@workspace/finance/server/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceLedgerRevise } from "@workspace/platform/server/auth";

export const DELETE = createCommandRoute({
  access: checkFinanceLedgerRevise,
  paramsSchema: routeIdParamsSchema,
  paramsError: "无效的规则 ID",
  buildCommand: ({ params }) => buildFinanceRouteIdCommand(params.id),
  action: executeDeleteReclassRuleRouteCommand,
});
