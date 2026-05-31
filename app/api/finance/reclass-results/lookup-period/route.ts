import { NextResponse } from "next/server";
import { withFinanceLedgerAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

export const GET = withFinanceLedgerAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = parseInt(searchParams.get("year") || "", 10);
  const month = parseInt(searchParams.get("month") || "", 10);

  if (!companyCode || !year || !month) {
    return NextResponse.json({ periodId: null });
  }

  const period = await prisma.financePeriod.findFirst({
    where: { companyCode, year, month },
    select: { id: true },
  });

  return NextResponse.json({ periodId: period?.id ?? null });
});
