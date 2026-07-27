import { z } from "zod";

import {
  buildSaveFinanceConsolidationScopeSelectionRouteCommand,
  executeSaveFinanceConsolidationScopeSelectionRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const bodySchema = z.object({
  parentCompanyId: z.number().int().positive(),
  year: z.number().int().min(1900).max(2099),
  month: z.number().int().min(1).max(12),
  periodKind: z.enum(["year", "quarter", "month"]),
  companyId: z.number().int().positive(),
  relationId: z.number().int().positive(),
  expectedRelationVersion: z.number().int().positive(),
  included: z.boolean(),
});

export const PUT = createCommandRoute({
  bodySchema,
  bodyError: "本次合并报表范围参数无效",
  buildCommand: ({ body, user }) => buildSaveFinanceConsolidationScopeSelectionRouteCommand(body, user.userId),
  action: executeSaveFinanceConsolidationScopeSelectionRouteCommand,
});
