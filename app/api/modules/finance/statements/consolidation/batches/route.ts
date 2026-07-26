import { z } from "zod";

import {
  buildEnsureConsolidationBatchRouteCommand,
  executeEnsureConsolidationBatchRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const ensureBatchSchema = z.object({
  parentCompanyId: z.number().int().positive(),
  year: z.number().int().min(1900).max(2099),
  month: z.number().int().min(1).max(12),
  periodKind: z.enum(["year", "quarter", "month"]).optional(),
  baseBatchId: z.number().int().positive().nullable().optional(),
});

export const POST = createCommandRoute({
  bodySchema: ensureBatchSchema,
  bodyError: "合并批次参数无效",
  buildCommand: ({ body, user }) => buildEnsureConsolidationBatchRouteCommand(body, user.userId),
  action: executeEnsureConsolidationBatchRouteCommand,
});
