import { z } from "zod";

import {
  buildReviewFinanceGroupAccountRouteCommand,
  executeReviewFinanceGroupAccountRouteCommand,
} from "@workspace/finance/server/ledger/group-accounts";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const reviewGroupAccountSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  expectedUpdatedAt: z.string().min(1),
});

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "集团科目参数无效",
  bodySchema: reviewGroupAccountSchema,
  bodyError: "集团科目复核请求不完整",
  buildCommand: ({ params, body, user }) => buildReviewFinanceGroupAccountRouteCommand({
    userId: user.userId,
    groupAccountId: params.id,
    ...body,
  }),
  action: executeReviewFinanceGroupAccountRouteCommand,
});
