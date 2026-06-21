import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@workspace/platform/server/with-auth";
import {
  listFinanceBalances,
  recomputeFinanceBalances,
} from "@workspace/finance/server/ledger/balance-api";

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

/** GET 查询余额 */
export const GET = withFinanceLedgerAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsed = balancesQuerySchema.safeParse({
    periodId: searchParams.get("periodId") || undefined,
    companyCode: searchParams.get("companyCode") || undefined,
    year: searchParams.get("year") || undefined,
    month: searchParams.get("month") || undefined,
    page: searchParams.get("page") || undefined,
    pageSize: searchParams.get("pageSize") || undefined,
    keyword: searchParams.get("keyword") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

  const { periodId, companyCode, year, month } = parsed.data;
  if (!periodId && (!companyCode || year === undefined || month === undefined)) {
    return NextResponse.json({ error: "periodId 或 companyCode+year+month 为必填" }, { status: 400 });
  }

  return NextResponse.json(await listFinanceBalances(parsed.data));
});

/** POST 重新计算指定期间的余额 */
export const POST = withFinanceLedgerWrite(async (request: Request) => {
  const parsed = recomputeBalancesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "periodId 为必填且为有效数字" }, { status: 400 });

  const result = await recomputeFinanceBalances(parsed.data);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result);
});
