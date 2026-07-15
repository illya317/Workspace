import { z } from "zod";

import {
  buildSaveStatementExchangeRateRouteCommand,
  executeSaveStatementExchangeRateRouteCommand,
} from "@workspace/finance/server/statements/exchange-rate-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const exchangeRateSchema = z.object({
  baseCurrency: z.literal("CAD"),
  quoteCurrency: z.literal("CNY"),
  rateKind: z.enum(["closing", "historicalInvestment"]),
  rateDate: z.string().trim().min(1),
  rate: z.number().positive(),
  sourceUrl: z.string().trim().min(1),
  publishedAt: z.string().trim().nullable().optional(),
  status: z.literal("draft").optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const POST = createCommandRoute({
  bodySchema: exchangeRateSchema,
  bodyError: "汇率证据参数无效",
  buildCommand: ({ body, user }) => buildSaveStatementExchangeRateRouteCommand(
    { ...body, status: "draft" },
    user.userId,
  ),
  action: executeSaveStatementExchangeRateRouteCommand,
});
