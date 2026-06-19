import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@workspace/platform/server/with-auth";
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

export const GET = withFinanceLedgerAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsed = periodsQuerySchema.safeParse({
    year: searchParams.get("year") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

  return NextResponse.json(await listFinancePeriods(parsed.data));
});

export const POST = withFinanceLedgerWrite(async (request: Request, _user) => {
  const parsed = createPeriodSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "年份和月份为必填" }, { status: 400 });
  }

  const result = await createFinancePeriod(parsed.data);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result);
});
