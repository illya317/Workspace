import { z } from "zod";

import {
  buildSaveConsolidationSourcesRouteCommand,
  executeSaveConsolidationSourcesRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({ batchId: z.coerce.number().int().positive() });
const sourceSelectionSchema = z.object({
  entitySnapshotId: z.number().int().positive(),
  reportType: z.enum(["balanceSheet", "incomeStatement", "cashFlow"]),
  workpaperId: z.number().int().positive().nullable().optional(),
  acceptSystemSource: z.boolean().optional(),
  evidence: z.string().trim().max(2000).nullable().optional(),
});
const currencyPolicySchema = z.object({
  entitySnapshotId: z.number().int().positive(),
  functionalCurrency: z.enum(["CNY", "CAD"]),
  evidence: z.string().trim().min(1).max(2000),
});
const rateApplicationSchema = z.object({
  exchangeRateId: z.number().int().positive(),
  applicationType: z.enum(["closing", "historicalInvestment", "historicalCapital"]),
  periodBasis: z.enum(["current", "comparative"]),
  entitySnapshotId: z.number().int().positive(),
  voucherItemId: z.number().int().positive().nullable().optional(),
  capitalContributionDate: z.string().date().nullable().optional(),
  capitalOriginalAmount: z.number().positive().nullable().optional(),
  evidence: z.string().trim().min(1).max(2000),
});
const saveSourcesSchema = z.object({
  expectedRevision: z.number().int().positive(),
  selections: z.array(sourceSelectionSchema).min(1),
  exchangeRateIds: z.array(z.number().int().positive()),
  currencyPolicies: z.array(currencyPolicySchema).min(1),
  rateApplications: z.array(rateApplicationSchema),
});

export const PUT = createCommandRoute({
  paramsSchema,
  bodySchema: saveSourcesSchema,
  paramsError: "合并批次 ID 无效",
  bodyError: "合并来源参数无效",
  buildCommand: ({ params, body, user }) => buildSaveConsolidationSourcesRouteCommand(
    params.batchId,
    body,
    user.userId,
  ),
  action: executeSaveConsolidationSourcesRouteCommand,
});
