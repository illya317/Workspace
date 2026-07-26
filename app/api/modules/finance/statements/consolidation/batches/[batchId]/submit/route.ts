import { z } from "zod";

import {
  buildSubmitConsolidationBatchRouteCommand,
  executeConsolidationBatchLifecycleRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({ batchId: z.coerce.number().int().positive() });
const lifecycleSchema = z.object({
  expectedRevision: z.number().int().positive(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const POST = createCommandRoute({
  paramsSchema,
  bodySchema: lifecycleSchema,
  paramsError: "合并批次 ID 无效",
  bodyError: "合并批次提交参数无效",
  buildCommand: ({ params, body, user }) => buildSubmitConsolidationBatchRouteCommand(
    params.batchId,
    user.userId,
    body,
  ),
  action: executeConsolidationBatchLifecycleRouteCommand,
});
