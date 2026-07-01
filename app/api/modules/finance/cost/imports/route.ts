import { z } from "zod";

import {
  executeListCostImportsCommand,
  executeUnsupportedCostImportCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceCostAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

const costImportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

export const GET = createCommandRoute({
  access: checkFinanceCostAccess,
  querySchema: costImportsQuerySchema,
  buildCommand: ({ query }) => okCommand(query),
  action: executeListCostImportsCommand,
});

export const POST = createCommandRoute({
  buildCommand: () => okCommand({}),
  action: executeUnsupportedCostImportCommand,
});
