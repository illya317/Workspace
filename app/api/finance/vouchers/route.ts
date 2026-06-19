import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@workspace/platform/server/with-auth";
import { jsonBadRequest, jsonResultResponse } from "@workspace/platform/server/api";
import { createVoucher, listVouchers } from "@workspace/finance/server/ledger/voucher-service";

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

const createVoucherSchema = z
  .object({
    voucherNo: z.string().min(1),
    date: z.string().min(1),
    companyCode: z.string().min(1),
    description: z.string().optional(),
    status: z.string().optional(),
    items: z.array(voucherItemSchema).min(1),
  })
  .passthrough();

export const GET = withFinanceLedgerAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsed = listVouchersSchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return jsonBadRequest("参数无效");

  return NextResponse.json(await listVouchers(parsed.data));
});

export const POST = withFinanceLedgerWrite(async (request: Request, user) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonBadRequest("请求体为必填");

  const parsed = createVoucherSchema.safeParse(body);
  if (!parsed.success) return jsonBadRequest("凭证号、日期、公司编码、分录为必填");

  const result = await createVoucher(parsed.data, user.userId);
  return jsonResultResponse(result);
});
