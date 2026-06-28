import { z } from "zod";

import { executeReportDetailCommand } from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceReportAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

const reportDetailQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
  codes: z.string().min(1).transform((codes) => codes.split(/[,+]/).map((code) => code.trim()).filter(Boolean)),
});

export const GET = createCommandRoute({
  access: checkFinanceReportAccess,
  querySchema: reportDetailQuerySchema,
  queryError: "缺少参数",
  buildCommand: ({ query }) => okCommand({
    companyCode: query.companyCode,
    year: query.year,
    month: query.month,
    codes: query.codes,
  }),
  action: executeReportDetailCommand,
});
