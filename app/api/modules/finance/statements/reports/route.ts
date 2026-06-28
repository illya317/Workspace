import { z } from "zod";

import {
  buildGenerateFinanceReportCommand,
  executeGenerateFinanceReportCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceReportAccess } from "@workspace/platform/server/auth";

const optionalPositiveInt = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().positive().optional(),
);

const optionalYear = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().min(2020).max(2099).optional(),
);

const optionalMonth = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().min(1).max(12).optional(),
);

const reportQuerySchema = z.object({
  periodId: optionalPositiveInt,
  companyCode: z.string().optional(),
  year: optionalYear,
  month: optionalMonth,
  type: z.string().optional(),
});

export const GET = createCommandRoute({
  access: checkFinanceReportAccess,
  querySchema: reportQuerySchema,
  buildCommand: ({ query }) => buildGenerateFinanceReportCommand(query),
  action: executeGenerateFinanceReportCommand,
});
