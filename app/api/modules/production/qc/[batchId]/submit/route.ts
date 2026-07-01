import { z } from "zod";

import {
  buildQcBatchIdCommand,
  executeSubmitQcBatchCommand,
} from "@workspace/production/server/qc";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
});

export const POST = createCommandRoute({
  paramsSchema,
  paramsError: "无效批次 ID",
  buildCommand: ({ params }) => buildQcBatchIdCommand(params.batchId),
  action: executeSubmitQcBatchCommand,
});
