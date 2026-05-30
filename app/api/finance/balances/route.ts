import { NextResponse } from "next/server";
import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { computeBalancesForPeriod } from "@/server/services/finance/ledger/balances";

/** GET 查询余额 */
export const GET = withFinanceLedgerAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");

  let targetPeriodId: number | null = null;

  if (periodId) {
    targetPeriodId = parseInt(periodId);
  } else {
    const companyCode = searchParams.get("companyCode");
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    if (!companyCode || !year || !month) {
      return NextResponse.json({ error: "periodId 或 companyCode+year+month 为必填" }, { status: 400 });
    }
    const period = await prisma.financePeriod.findFirst({
      where: { companyCode, year: parseInt(year), month: parseInt(month) },
    });
    if (!period) return NextResponse.json({ balances: [] });
    targetPeriodId = period.id;
  }

  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
  const skip = (page - 1) * pageSize;

  const [balances, total] = await Promise.all([
    prisma.financeAccountBalance.findMany({
      where: { periodId: targetPeriodId },
      include: { account: true },
      orderBy: { account: { code: "asc" } },
      skip,
      take: pageSize,
    }),
    prisma.financeAccountBalance.count({ where: { periodId: targetPeriodId } }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return NextResponse.json({
    data: balances,
    total,
    page,
    pageSize,
    totalPages,
    balances,
    periodId: targetPeriodId,
  });
});

/** POST 重新计算指定期间的余额 */
export const POST = withFinanceLedgerWrite(async (request: Request) => {
  const body = await request.json();
  const { periodId } = body;
  if (!periodId) return NextResponse.json({ error: "periodId 为必填" }, { status: 400 });

  const period = await prisma.financePeriod.findUnique({ where: { id: parseInt(periodId) } });
  if (!period) return NextResponse.json({ error: "期间不存在" }, { status: 404 });
  if (period.isClosed) return NextResponse.json({ error: "期间已结账，不能重新计算" }, { status: 400 });

  try {
    const result = await computeBalancesForPeriod(period.id);
    return NextResponse.json({ success: true, count: result.count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "计算失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
