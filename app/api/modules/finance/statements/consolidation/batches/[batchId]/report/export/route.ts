import { z } from "zod";

import {
  buildConsolidatedStatementExportCommand,
  executeConsolidatedStatementExportCommand,
} from "@workspace/finance/server/statements/statement-export-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({ batchId: z.coerce.number().int().positive() });
const querySchema = z.object({ artifact: z.enum(["report", "workpaper"]).default("report") });

export const GET = createCommandRoute({
  paramsSchema,
  querySchema,
  paramsError: "合并批次 ID 无效",
  buildCommand: ({ params, query }) => buildConsolidatedStatementExportCommand(params.batchId, query.artifact),
  action: executeConsolidatedStatementExportCommand,
});
