import { z } from "zod";

import {
  buildSaveConsolidationEntryRouteCommand,
  executeSaveConsolidationEntryRouteCommand,
} from "@workspace/finance/server/statements/consolidation-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({ batchId: z.coerce.number().int().positive() });
const entryLineSchema = z.object({
  entitySnapshotId: z.number().int().positive(),
  statementType: z.enum(["balanceSheet", "incomeStatement", "cashFlow"]),
  lineCode: z.string().trim().min(1).max(200),
  accountCode: z.string().trim().max(100).nullable().optional(),
  debit: z.number().nonnegative(),
  credit: z.number().nonnegative(),
  currencyCode: z.string().trim().min(3).max(3).optional(),
  periodBasis: z.enum(["current", "comparative"]).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  matchSide: z.enum(["left", "right"]).nullable().optional(),
  sourceKind: z.enum(["auxiliaryBalance", "openItem", "cashFlowAllocation", "workpaper", "voucher"]).nullable().optional(),
  sourceRecordId: z.number().int().positive().nullable().optional(),
  counterpartyEntitySnapshotId: z.number().int().positive().nullable().optional(),
});
const entrySchema = z.object({
  expectedRevision: z.number().int().positive(),
  entryId: z.number().int().positive().nullable().optional(),
  entryNo: z.string().trim().min(1).max(100),
  entryType: z.enum([
    "investmentEquity",
    "nonControllingInterest",
    "intercompanyBalance",
    "internalTrading",
    "internalLongTermAsset",
    "incomeDividend",
    "cashFlow",
  ]),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(2000).nullable().optional(),
  evidence: z.string().trim().min(1).max(4000),
  differenceResolution: z.string().trim().max(2000).nullable().optional(),
  supersedesEntryId: z.number().int().positive().nullable().optional(),
  reversalOfEntryId: z.number().int().positive().nullable().optional(),
  lines: z.array(entryLineSchema).min(2),
});

export const POST = createCommandRoute({
  paramsSchema,
  bodySchema: entrySchema,
  paramsError: "合并批次 ID 无效",
  bodyError: "抵销分录参数无效",
  buildCommand: ({ params, body, user }) => buildSaveConsolidationEntryRouteCommand(
    params.batchId,
    body,
    user.userId,
  ),
  action: executeSaveConsolidationEntryRouteCommand,
});
