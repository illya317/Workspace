import { z } from "zod";

import {
  buildCreateVoucherCommand,
  executeCreateVoucherCommand,
  executeListVouchersCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceLedgerAccess, checkFinanceLedgerWrite } from "@workspace/platform/server/auth";

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

const listVouchersSchema = z.object({
  periodId: optionalPositiveInt,
  status: z.string().optional(),
  companyCode: z.string().optional(),
  year: optionalYear,
  month: optionalMonth,
  keyword: z.string().default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const voucherItemSchema = z.object({
  accountId: z.unknown(),
  debit: z.unknown(),
  credit: z.unknown(),
  description: z.unknown().optional(),
});

const createVoucherSchema = z.object({
  voucherNo: z.string().min(1),
  date: z.string().min(1),
  companyCode: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  items: z.array(voucherItemSchema).min(1),
}).passthrough();

export const GET = createCommandRoute({
  access: checkFinanceLedgerAccess,
  querySchema: listVouchersSchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: executeListVouchersCommand,
});

export const POST = createCommandRoute({
  access: checkFinanceLedgerWrite,
  bodySchema: createVoucherSchema,
  bodyError: "凭证号、日期、公司编码、分录为必填",
  buildCommand: ({ body, user }) => buildCreateVoucherCommand(body, user.userId),
  action: executeCreateVoucherCommand,
});
