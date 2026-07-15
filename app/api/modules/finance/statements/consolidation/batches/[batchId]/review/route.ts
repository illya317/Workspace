import { z } from "zod";

import {
  buildReviewConsolidationBatchRouteCommand,
  executeConsolidationBatchLifecycleRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({ batchId: z.coerce.number().int().positive() });
const reviewSchema = z.object({
  expectedRevision: z.number().int().positive(),
  note: z.string().trim().min(1).max(2000),
});

export const POST = createCommandRoute({
  paramsSchema,
  bodySchema: reviewSchema,
  paramsError: "合并批次 ID 无效",
  bodyError: "合并批次复核参数无效",
  buildCommand: ({ params, body, user }) => buildReviewConsolidationBatchRouteCommand(
    params.batchId,
    user.userId,
    body,
  ),
  action: executeConsolidationBatchLifecycleRouteCommand,
});
