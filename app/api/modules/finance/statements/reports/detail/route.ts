import { z } from "zod";

import { executeReportDetailCommand } from "@workspace/finance/server/statements/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const reportDetailQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
  periodKind: z.enum(["year", "quarter", "month"]).optional(),
  reportType: z.enum(["balance", "income"]).optional(),
  direction: z.enum(["debit", "credit"]).optional(),
  codes: z.string().min(1).transform((codes) => codes.split(/[,+-]/).map((code) => code.trim()).filter(Boolean)),
});

export const GET = createCommandRoute({
  querySchema: reportDetailQuerySchema,
  queryError: "缺少参数",
  buildCommand: ({ query }) => okCommand({
    companyCode: query.companyCode,
    year: query.year,
    month: query.month,
    periodKind: query.periodKind ?? "month",
    reportType: query.reportType ?? "balance",
    direction: query.direction,
    codes: query.codes,
  }),
  action: executeReportDetailCommand,
});
