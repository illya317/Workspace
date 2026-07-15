import { z } from "zod";

import {
  buildReviewStatementExchangeRateRouteCommand,
  executeReviewStatementExchangeRateRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({ rateId: z.coerce.number().int().positive() });
const reviewSchema = z.object({ note: z.string().trim().min(1).max(2000) });

export const POST = createCommandRoute({
  paramsSchema,
  bodySchema: reviewSchema,
  paramsError: "汇率证据 ID 无效",
  bodyError: "汇率复核参数无效",
  buildCommand: ({ params, body, user }) => buildReviewStatementExchangeRateRouteCommand(
    params.rateId,
    user.userId,
    body.note,
  ),
  action: executeReviewStatementExchangeRateRouteCommand,
});
