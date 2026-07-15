import { z } from "zod";

import {
  buildScanReclassRulesCommand,
  buildSaveReclassRuleChangeSetRouteCommand,
  executeScanReclassRulesCommand,
  executeSaveReclassRuleChangeSetRouteCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const scanRulesQuerySchema = z.object({});

const saveRulesSchema = z.object({
  changes: z.array(z.object({
    sourceAccountCode: z.string().min(1),
    abnormalSide: z.enum(["debit", "credit", "both"]),
    targetAccountCode: z.string().min(1).nullable(),
  })).min(1).max(500),
});

export const GET = createCommandRoute({
  querySchema: scanRulesQuerySchema,
  buildCommand: () => buildScanReclassRulesCommand(),
  action: executeScanReclassRulesCommand,
});

export const PUT = createCommandRoute({
  bodySchema: saveRulesSchema,
  bodyError: "changes 为必填",
  buildCommand: ({ body, user }) => buildSaveReclassRuleChangeSetRouteCommand({ ...body, userId: user.userId }),
  action: executeSaveReclassRuleChangeSetRouteCommand,
});
