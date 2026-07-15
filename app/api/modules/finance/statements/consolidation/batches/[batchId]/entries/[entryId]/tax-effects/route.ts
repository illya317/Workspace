import { z } from "zod";

import {
  buildSaveConsolidationTaxEffectRouteCommand,
  executeSaveConsolidationTaxEffectRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  batchId: z.coerce.number().int().positive(),
  entryId: z.coerce.number().int().positive(),
});
const taxEffectSchema = z.object({
  expectedRevision: z.number().int().positive(),
  entitySnapshotId: z.number().int().positive().nullable().optional(),
  effectKey: z.string().trim().min(1).max(100),
  taxEffectType: z.enum(["deductible", "taxable"]),
  differenceAmount: z.number(),
  taxRate: z.number().positive().max(1),
  recognition: z.enum(["asset", "liability", "unrecognized"]),
  periodBasis: z.enum(["current", "comparative"]).optional(),
  jurisdiction: z.string().trim().max(200).nullable().optional(),
  recognitionLocation: z.enum(["profitOrLoss", "otherComprehensiveIncome", "equity"]).nullable().optional(),
  balanceSheetLineCode: z.string().trim().max(200).nullable().optional(),
  counterpartLineCode: z.string().trim().max(200).nullable().optional(),
  reversalPeriod: z.string().trim().max(100).nullable().optional(),
  recoverabilityConclusion: z.string().trim().min(1).max(2000),
  evidence: z.string().trim().min(1).max(4000),
});

export const PUT = createCommandRoute({
  paramsSchema,
  bodySchema: taxEffectSchema,
  paramsError: "合并批次或抵销分录 ID 无效",
  bodyError: "抵销税务影响参数无效",
  buildCommand: ({ params, body, user }) => buildSaveConsolidationTaxEffectRouteCommand(
    params.batchId,
    params.entryId,
    body,
    user.userId,
  ),
  action: executeSaveConsolidationTaxEffectRouteCommand,
});
