import { z } from "zod";

import {
  buildApproveConsolidationEntryRouteCommand,
  executeReviewConsolidationEntryRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
  entryId: z.coerce.number().int().positive(),
});
const bodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const POST = createCommandRoute({
  paramsSchema,
  bodySchema,
  paramsError: "合并批次或抵销分录 ID 无效",
  bodyError: "抵销分录通过参数无效",
  buildCommand: ({ params, body, user }) => buildApproveConsolidationEntryRouteCommand(
    params.batchId,
    params.entryId,
    body,
    user.userId,
  ),
  action: executeReviewConsolidationEntryRouteCommand,
});
