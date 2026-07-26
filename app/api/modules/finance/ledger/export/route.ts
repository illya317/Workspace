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
  view: z.enum(["accounts", "vouchers", "balances", "counterparty"]),
  companyCode: z.string().trim().optional(),
  year: optionalYear,
  month: optionalMonth,
  keyword: z.string().optional(),
  subjectLevel: z.string().optional(),
  scope: z.enum(["mapped", "unmapped", "inactive", "all"]).optional(),
  category: z.enum(["ar", "ap", "otherAr", "otherAp"]).optional(),
});

export const GET = createCommandRoute({
  querySchema,
  queryError: "导出筛选条件无效",
  buildCommand: ({ query }) => buildLedgerExportCommand(query),
  action: executeLedgerExportCommand,
});
