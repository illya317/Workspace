import { z } from "zod";

import {
  buildLedgerExportCommand,
  executeLedgerExportCommand,
} from "@workspace/finance/server/ledger/ledger-export-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const optionalYear = z.preprocess(
  (value) => value === undefined || value === "" ? undefined : Number(value),
  z.number().int().min(2000).max(2099).optional(),
);
const optionalMonth = z.preprocess(
  (value) => value === undefined || value === "" ? undefined : Number(value),
  z.number().int().min(1).max(12).optional(),
);

const querySchema = z.object({
  view: z.enum(["accounts", "groupAccounts", "vouchers", "balances", "counterparty", "assets"]),
  companyCode: z.string().trim().optional(),
  year: optionalYear,
  month: optionalMonth,
  periodKind: z.enum(["year", "quarter", "month"]).optional(),
  keyword: z.string().optional(),
  subjectLevel: z.string().optional(),
  scope: z.enum(["mapped", "unmapped", "inactive", "all"]).optional(),
  category: z.enum(["ar", "ap", "otherAr", "otherAp"]).optional(),
  relationScope: z.enum(["all", "related", "other", "unrelated", "unmatched"]).optional(),
  objectType: z.enum(["all", "groupCompany", "customer", "supplier", "employee", "department", "other"]).optional(),
  voucherKind: z.enum(["standard", "group"]).default("standard"),
  documentType: z.enum(["groupAdjustment", "elimination", "reclassification", "allocation"]).optional(),
  origin: z.enum(["manual", "system"]).optional(),
  exportMode: z.enum(["summary", "detail"]).default("summary"),
  voucherPeriodScope: z.enum(["current", "history"]).default("current"),
  policyVersionId: z.coerce.number().int().positive().optional(),
  accountCategory: z.enum(["asset", "liability", "common", "equity", "cost", "revenue", "expense"]).optional(),
  accountUsage: z.enum(["consolidation", "reclassification"]).optional(),
  reviewStatus: z.enum(["confirmed", "reviewed", "pending_review", "pending_delete"]).optional(),
  assetView: z.enum(["cards", "period", "adjustments", "reconciliation"]).optional(),
});

export const GET = createCommandRoute({
  querySchema,
  queryError: "导出筛选条件无效",
  buildCommand: ({ query }) => buildLedgerExportCommand(query),
  action: executeLedgerExportCommand,
});
