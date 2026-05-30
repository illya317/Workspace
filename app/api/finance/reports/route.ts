import { NextResponse } from "next/server";
import { withFinanceReportAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { generateReport } from "@/server/services/finance/statements/report-generator";

/** 报表生成：资产负债表 / 利润表 / 现金流量表 */
export const GET = withFinanceReportAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const reportType = searchParams.get("type") as "balance" | "income" | "cashflow" | null;
  if (!reportType) return NextResponse.json({ error: "type 为必填（balance/income/cashflow）" }, { status: 400 });

  let targetPeriodId: number;
  if (periodId) {
    targetPeriodId = parseInt(periodId);
  } else if (companyCode && year && month) {
    const period = await prisma.financePeriod.findFirst({
      where: { companyCode, year: parseInt(year), month: parseInt(month) },
    });
    if (!period) return NextResponse.json({ error: "期间不存在" }, { status: 404 });
    targetPeriodId = period.id;
  } else {
    return NextResponse.json({ error: "periodId 或 companyCode+year+month 为必填" }, { status: 400 });
  }

  const period = await prisma.financePeriod.findUnique({ where: { id: targetPeriodId } });
  if (!period) return NextResponse.json({ error: "期间不存在" }, { status: 404 });

  const isCanada = period.companyCode === "04";

  const balances = await prisma.financeAccountBalance.findMany({
    where: { periodId: targetPeriodId },
    include: { account: true },
    orderBy: { account: { code: "asc" } },
  });

  const yearBalances = await prisma.financeAccountBalance.findMany({
    where: {
      period: { companyCode: period.companyCode, year: period.year },
    },
    include: { account: true },
  });

  return generateReport({ period, balances, yearBalances, reportType, isCanada });
});
