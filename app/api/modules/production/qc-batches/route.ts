import { z } from "zod";

import {
  executeCreateQcBatchCommand,
  executeListQcBatchesCommand,
} from "@workspace/production/server/qc";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const createQcBatchSchema = z.object({
  productKey: z.coerce.string().trim().min(1),
  batchNumber: z.coerce.string().trim().min(1),
});

export const GET = createCommandRoute({
  buildCommand: () => okCommand({}),
  action: executeListQcBatchesCommand,
});

export const POST = createCommandRoute({
  bodySchema: createQcBatchSchema,
  bodyError: "productKey and batchNumber are required",
  buildCommand: ({ body }) => okCommand(body),
  action: executeCreateQcBatchCommand,
});
