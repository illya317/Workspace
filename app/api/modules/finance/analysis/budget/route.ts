import { z } from "zod";

import { executeBudgetAnalysisCommand } from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";import { okCommand } from "@workspace/platform/server/domain-validation";

const budgetAnalysisQuerySchema = z.object({
  year: z.coerce.number().int().catch(2026),
  companyCode: z.string().optional(),
});

export const GET = createCommandRoute({
  querySchema: budgetAnalysisQuerySchema,
  buildCommand: ({ query }) => okCommand(query),
  action: executeBudgetAnalysisCommand,
});
