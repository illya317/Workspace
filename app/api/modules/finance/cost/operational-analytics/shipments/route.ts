import {
  executeOperationalAnalyticsShipmentList,
  operationalAnalyticsShipmentQuerySchema,
} from "@workspace/finance/server/cost";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { isProgrammaticApiRequest } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { registerFinanceWorkSpaceAccessProvider } from "@workspace/finance/server/cost/work-space-access-provider";

registerFinanceWorkSpaceAccessProvider();

export const GET = createCommandRoute({
  querySchema: operationalAnalyticsShipmentQuerySchema,
  queryError: "经营分析参数无效",
  buildCommand: ({ query, user, request }) => okCommand({
    userId: user.userId,
    query: { ...query, viaPersonalApiKey: isProgrammaticApiRequest(request) },
  }),
  action: ({ userId, query }) => executeOperationalAnalyticsShipmentList(userId, query),
});
