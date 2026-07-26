import {
  executeOperationalAnalyticsShipmentAnalytics,
  operationalAnalyticsShipmentAnalyticsQuerySchema,
} from "@workspace/finance/server/cost";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { registerFinanceWorkSpaceAccessProvider } from "@workspace/finance/server/cost/work-space-access-provider";

registerFinanceWorkSpaceAccessProvider();

export const GET = createCommandRoute({
  querySchema: operationalAnalyticsShipmentAnalyticsQuerySchema,
  queryError: "经营分析参数无效",
  buildCommand: ({ query, user, request }) => okCommand({
    userId: user.userId,
    query: { ...query, viaPersonalApiKey: Boolean(request.headers.get("x-api-key")) },
  }),
  action: ({ userId, query }) => executeOperationalAnalyticsShipmentAnalytics(userId, query),
});
