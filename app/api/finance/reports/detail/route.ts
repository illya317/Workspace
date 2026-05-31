import { NextResponse } from "next/server";
import { withFinanceReportAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

/** 报表行项目明细：返回组成该行项目的所有科目余额 */
export const GET = withFinanceReportAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const codes = searchParams.get("codes"); // comma-separated account codes

  if (!companyCode || !year || !month || !codes) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }

  const codeList = codes.split(/[,+]/).map((c) => c.trim()).filter(Boolean);

  const period = await prisma.financePeriod.findFirst({
    where: { companyCode, year: parseInt(year), month: parseInt(month) },
  });
  if (!period) return NextResponse.json({ error: "期间不存在" }, { status: 404 });

  const balances = await prisma.financeAccountBalance.findMany({
    where: {
      periodId: period.id,
      account: { code: { startsWith: "" } },
    },
    include: { account: true },
    orderBy: { account: { code: "asc" } },
  });

  // Filter balances whose account code starts with any of the requested codes
  const matched = balances.filter((b) =>
    codeList.some((code) => b.account.code.startsWith(code))
  );

  const details = matched.map((b) => {
    const closing = b.openingDebit - b.openingCredit + b.currentDebit - b.currentCredit;
    return {
      code: b.account.code,
      name: b.account.name,
      category: b.account.category,
      balanceDirection: b.account.balanceDirection,
      openingDebit: b.openingDebit,
      openingCredit: b.openingCredit,
      currentDebit: b.currentDebit,
      currentCredit: b.currentCredit,
      closing,
    };
  });

  return NextResponse.json({ details, total: details.reduce((s, d) => s + d.closing, 0) });
});
