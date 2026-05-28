import { NextResponse } from "next/server";
import { withFinanceAccess, withFinanceWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

/** GET 查询余额 */
export const GET = withFinanceAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");
  if (!periodId) return NextResponse.json({ error: "periodId 为必填" }, { status: 400 });

  const balances = await prisma.financeAccountBalance.findMany({
    where: { periodId: parseInt(periodId) },
    include: { account: true },
    orderBy: { account: { code: "asc" } },
  });

  return NextResponse.json({ balances });
});

/** POST 重新计算指定期间的余额 */
export const POST = withFinanceWrite(async (request: Request) => {
  const body = await request.json();
  const { periodId } = body;
  if (!periodId) return NextResponse.json({ error: "periodId 为必填" }, { status: 400 });

  const period = await prisma.financePeriod.findUnique({ where: { id: parseInt(periodId) } });
  if (!period) return NextResponse.json({ error: "期间不存在" }, { status: 404 });
  if (period.isClosed) return NextResponse.json({ error: "期间已结账，不能重新计算" }, { status: 400 });

  // 1. 获取所有科目
  const accounts = await prisma.financeAccount.findMany({ where: { isActive: true } });

  // 2. 获取上期余额作为本期期初
  const prevPeriod = await prisma.financePeriod.findFirst({
    where: {
      year: period.year,
      month: { lt: period.month },
      companyCode: period.companyCode,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const prevBalances = prevPeriod
    ? await prisma.financeAccountBalance.findMany({ where: { periodId: prevPeriod.id } })
    : [];

  const prevMap = new Map(prevBalances.map((b) => [b.accountId, b]));

  // 3. 获取本期已过账凭证的分录汇总
  const voucherItems = await prisma.financeVoucherItem.findMany({
    where: {
      voucher: { periodId: parseInt(periodId), status: "posted" },
    },
    include: { account: true },
  });

  const currentMap = new Map<number, { debit: number; credit: number }>();
  for (const item of voucherItems) {
    const acc = currentMap.get(item.accountId) || { debit: 0, credit: 0 };
    acc.debit += item.debit;
    acc.credit += item.credit;
    currentMap.set(item.accountId, acc);
  }

  // 4. 更新/创建余额记录
  const results = [];
  for (const account of accounts) {
    const prev = prevMap.get(account.id);
    const openingDebit = prev?.closingDebit || 0;
    const openingCredit = prev?.closingCredit || 0;
    const current = currentMap.get(account.id) || { debit: 0, credit: 0 };

    // 期末余额 = 期初 + 本期发生（按余额方向）
    let closingDebit = 0, closingCredit = 0;
    if (account.balanceDirection === "debit") {
      const net = openingDebit - openingCredit + current.debit - current.credit;
      if (net >= 0) closingDebit = net; else closingCredit = -net;
    } else {
      const net = openingCredit - openingDebit + current.credit - current.debit;
      if (net >= 0) closingCredit = net; else closingDebit = -net;
    }

    const balance = await prisma.financeAccountBalance.upsert({
      where: {
        accountId_periodId: { accountId: account.id, periodId: parseInt(periodId) },
      },
      update: {
        openingDebit, openingCredit,
        currentDebit: current.debit, currentCredit: current.credit,
        closingDebit, closingCredit,
      },
      create: {
        accountId: account.id, periodId: parseInt(periodId),
        openingDebit, openingCredit,
        currentDebit: current.debit, currentCredit: current.credit,
        closingDebit, closingCredit,
        companyCode: period.companyCode,
      },
    });
    results.push(balance);
  }

  return NextResponse.json({ success: true, count: results.length });
});
