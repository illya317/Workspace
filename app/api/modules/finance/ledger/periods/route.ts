import { z } from "zod";

import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceLedgerAccess, checkFinanceLedgerWrite } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  createFinancePeriod,
  listFinancePeriods,
} from "@workspace/finance/server/ledger/periods";

const periodsQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
});

const createPeriodSchema = z.object({
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  companyCode: z.string().optional(),
});

export const GET = createCommandRoute({
  access: checkFinanceLedgerAccess,
  querySchema: periodsQuerySchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: listFinancePeriods,
});

export const POST = createCommandRoute({
  access: checkFinanceLedgerWrite,
  bodySchema: createPeriodSchema,
  bodyError: "年份和月份为必填",
  buildCommand: ({ body }) => okCommand(body),
  action: createFinancePeriod,
});
