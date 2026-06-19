import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerAccess } from "@workspace/platform/server/with-auth";
import { lookupFinancePeriodId } from "@workspace/finance/server/ledger/periods";

const lookupPeriodQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  month: z.coerce.number().int(),
});

export const GET = withFinanceLedgerAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = lookupPeriodQuerySchema.safeParse({
    companyCode: searchParams.get("companyCode") || undefined,
    year: searchParams.get("year") || undefined,
    month: searchParams.get("month") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ periodId: null });

  return NextResponse.json(await lookupFinancePeriodId(parsed.data));
});
