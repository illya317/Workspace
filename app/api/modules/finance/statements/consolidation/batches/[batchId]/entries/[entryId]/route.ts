import { z } from "zod";

import {
  buildDeleteConsolidationEntryRouteCommand,
  executeDeleteConsolidationEntryRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
  entryId: z.coerce.number().int().positive(),
});
const deleteSchema = z.object({
  expectedRevision: z.number().int().positive(),
  note: z.string().trim().min(1).max(2000),
});

export const DELETE = createCommandRoute({
  paramsSchema,
  bodySchema: deleteSchema,
  paramsError: "合并批次或抵销分录 ID 无效",
  bodyError: "抵销分录删除参数无效",
  buildCommand: ({ params, body, user }) => buildDeleteConsolidationEntryRouteCommand(
    params.batchId,
    params.entryId,
    body,
    user.userId,
  ),
  action: executeDeleteConsolidationEntryRouteCommand,
});
