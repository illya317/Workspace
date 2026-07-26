import { z } from "zod";

import {
  buildRefreshStatementExchangeRateRouteCommand,
  executeRefreshStatementExchangeRateRouteCommand,
} from "@workspace/finance/server/statements/exchange-rate-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const exchangeRateSchema = z.object({
  currencyCode: z.string().trim().length(3),
  targetDate: z.string().trim().min(1),
});

export const POST = createCommandRoute({
  bodySchema: exchangeRateSchema,
  bodyError: "汇率刷新参数无效",
  buildCommand: ({ body, user }) => buildRefreshStatementExchangeRateRouteCommand(body, user.userId),
  action: executeRefreshStatementExchangeRateRouteCommand,
});
