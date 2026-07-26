import { z } from "zod";
import { isProductionBatchNumber, PRODUCTION_BATCH_NUMBER_MESSAGE } from "@workspace/platform/production-batch-number";

import {
  executeCreateQcBatchCommand,
  executeListQcBatchesCommand,
} from "@workspace/production/server/qc";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const createQcBatchSchema = z.object({
  productId: z.coerce.number().int().positive(),
  productKey: z.coerce.string().trim().min(1),
  batchNumber: z.coerce.string().trim().refine(isProductionBatchNumber, PRODUCTION_BATCH_NUMBER_MESSAGE),
});

export const GET = createCommandRoute({
  buildCommand: () => okCommand({}),
  action: executeListQcBatchesCommand,
});

export const POST = createCommandRoute({
  bodySchema: createQcBatchSchema,
  bodyError: "productId, productKey and batchNumber are required",
  buildCommand: ({ body, user }) => okCommand({ ...body, actorUserId: user.userId }),
  action: executeCreateQcBatchCommand,
});
