import { z } from "zod";

import {
  buildScanReclassRulesCommand,
  buildSaveReclassRuleChangeSetRouteCommand,
  executeScanReclassRulesCommand,
  executeSaveReclassRuleChangeSetRouteCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";const scanRulesQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
});

const saveRulesSchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  changes: z.array(z.object({
    sourceAccountCode: z.string().min(1),
    abnormalSide: z.enum(["debit", "credit", "both"]),
    targetAccountCode: z.string().min(1).nullable(),
  })).min(1).max(500),
});

export const GET = createCommandRoute({
  querySchema: scanRulesQuerySchema,
  queryError: "companyCode 和 year 为必填",
  buildCommand: ({ query }) => buildScanReclassRulesCommand(query),
  action: executeScanReclassRulesCommand,
});

export const PUT = createCommandRoute({
  bodySchema: saveRulesSchema,
  bodyError: "companyCode、year 和 changes 为必填",
  buildCommand: ({ body, user }) => buildSaveReclassRuleChangeSetRouteCommand({ ...body, userId: user.userId }),
  action: executeSaveReclassRuleChangeSetRouteCommand,
});
