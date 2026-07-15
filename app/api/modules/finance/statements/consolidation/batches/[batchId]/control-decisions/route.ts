import { z } from "zod";

import {
  buildSaveConsolidationControlDecisionRouteCommand,
  executeSaveConsolidationControlDecisionRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({ batchId: z.coerce.number().int().positive() });
const controlDecisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  controlKey: z.enum([
    "scope",
    "ownership",
    "sources",
    "fx",
    "tax",
    "elimination:investmentEquity",
    "elimination:nonControllingInterest",
    "elimination:intercompanyBalance",
    "elimination:internalTrading",
    "elimination:internalLongTermAsset",
    "elimination:incomeDividend",
    "elimination:cashFlow",
  ]),
  decision: z.enum(["completed", "notApplicable"]),
  conclusion: z.string().trim().min(1).max(2000),
  evidence: z.string().trim().min(1).max(4000),
});

export const PUT = createCommandRoute({
  paramsSchema,
  bodySchema: controlDecisionSchema,
  paramsError: "合并批次 ID 无效",
  bodyError: "合并控制结论参数无效",
  buildCommand: ({ params, body, user }) => buildSaveConsolidationControlDecisionRouteCommand(
    params.batchId,
    body,
    user.userId,
  ),
  action: executeSaveConsolidationControlDecisionRouteCommand,
});
