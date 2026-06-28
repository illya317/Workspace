import { z } from "zod";

import {
  buildScanReclassRulesCommand,
  buildUpsertReclassRuleRouteCommand,
  executeScanReclassRulesCommand,
  executeUpsertReclassRuleRouteCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceLedgerAccess, checkFinanceLedgerWrite } from "@workspace/platform/server/auth";

const scanRulesQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
});

const upsertRuleSchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  sourceAccountCode: z.string().min(1),
  abnormalSide: z.enum(["debit", "credit", "both"]),
  targetAccountCode: z.string().min(1),
  enabled: z.boolean().optional(),
  note: z.string().nullable().optional(),
});

export const GET = createCommandRoute({
  access: checkFinanceLedgerAccess,
  querySchema: scanRulesQuerySchema,
  queryError: "companyCode 和 year 为必填",
  buildCommand: ({ query }) => buildScanReclassRulesCommand(query),
  action: executeScanReclassRulesCommand,
});

export const PUT = createCommandRoute({
  access: checkFinanceLedgerWrite,
  bodySchema: upsertRuleSchema,
  bodyError: "companyCode, year, sourceAccountCode, abnormalSide, targetAccountCode 为必填",
  buildCommand: ({ body }) => buildUpsertReclassRuleRouteCommand(body),
  action: executeUpsertReclassRuleRouteCommand,
});
