import { z } from "zod";

import {
  buildListFinanceBalancesCommand,
  executeListFinanceBalancesCommand,
  executeRecomputeFinanceBalancesCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceLedgerAccess, checkFinanceLedgerWrite } from "@workspace/platform/server/auth";

const balancesQuerySchema = z.object({
  periodId: z.coerce.number().int().positive().optional(),
  companyCode: z.string().optional(),
  year: z.coerce.number().int().min(2020).max(2099).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  keyword: z.string().optional(),
});

const recomputeBalancesSchema = z.object({
  periodId: z.coerce.number().int().positive(),
});

export const GET = createCommandRoute({
  access: checkFinanceLedgerAccess,
  querySchema: balancesQuerySchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => buildListFinanceBalancesCommand(query),
  action: executeListFinanceBalancesCommand,
});

export const POST = createCommandRoute({
  access: checkFinanceLedgerWrite,
  bodySchema: recomputeBalancesSchema,
  bodyError: "periodId 为必填且为有效数字",
  buildCommand: ({ body }) => okCommand(body),
  action: executeRecomputeFinanceBalancesCommand,
});
