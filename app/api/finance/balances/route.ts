import { NextResponse } from "next/server";
import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { computeBalancesForPeriod } from "@/server/services/finance/ledger/balances";
import { parsePositiveInt, parseYear, parseMonth, parsePageParams } from "@/lib/validation";
import { matchText } from "@/lib/search";

/** GET 查询余额 */
export const GET = withFinanceLedgerAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");

  let targetPeriodId: number | null = null;

  if (periodId) {
    targetPeriodId = parsePositiveInt(periodId, 0);
    if (targetPeriodId === 0) return NextResponse.json({ error: "periodId 无效" }, { status: 400 });
  } else {
    const companyCode = searchParams.get("companyCode");
    const yearNum = parseYear(searchParams.get("year"));
    const monthNum = parseMonth(searchParams.get("month"));
    if (!companyCode || yearNum === null || monthNum === null) {
      return NextResponse.json({ error: "periodId 或 companyCode+year+month 为必填" }, { status: 400 });
    }
    const period = await prisma.financePeriod.findFirst({
      where: { companyCode, year: yearNum, month: monthNum },
    });
    if (!period) return NextResponse.json({ balances: [] });
    targetPeriodId = period.id;
  }

  const { page, pageSize } = parsePageParams(searchParams);
  const keyword = searchParams.get("keyword") || "";
  const skip = (page - 1) * pageSize;

  const where = { periodId: targetPeriodId! };
  const hasKeyword = !!keyword;

  if (hasKeyword) {
    const all = await prisma.financeAccountBalance.findMany({
      where,
      include: { account: true },
      orderBy: { account: { code: "asc" } },
    });
    const filtered = all.filter(
      (b) => matchText(b.account.code, keyword) || matchText(b.account.name, keyword),
    );
    const total = filtered.length;
    return NextResponse.json({
      data: filtered.slice(skip, skip + pageSize),
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize),
      balances: filtered.slice(skip, skip + pageSize),
    });
  }

  const [balances, total] = await Promise.all([
    prisma.financeAccountBalance.findMany({
      where,
      include: { account: true },
      orderBy: { account: { code: "asc" } },
      skip,
      take: pageSize,
    }),
    prisma.financeAccountBalance.count({ where }),
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
  const periodId = parsePositiveInt(body.periodId, 0);
  if (periodId === 0) return NextResponse.json({ error: "periodId 为必填且为有效数字" }, { status: 400 });

  const period = await prisma.financePeriod.findUnique({ where: { id: periodId } });
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
