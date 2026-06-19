import { matchText } from "@workspace/core/search";
import { prisma } from "@workspace/platform/server/prisma";
import { computeBalancesForPeriod } from "./balances";

export type ListFinanceBalancesInput = {
  periodId?: number;
  companyCode?: string;
  year?: number;
  month?: number;
  page: number;
  pageSize: number;
  keyword?: string;
};

export type RecomputeFinanceBalancesInput = {
  periodId: number;
};

export async function listFinanceBalances(input: ListFinanceBalancesInput) {
  let targetPeriodId = input.periodId ?? null;

  if (!targetPeriodId) {
    const period = await prisma.financePeriod.findFirst({
      where: { companyCode: input.companyCode, year: input.year, month: input.month },
    });
    if (!period) return { balances: [] };
    targetPeriodId = period.id;
  }

  const page = input.page;
  const pageSize = input.pageSize;
  const skip = (page - 1) * pageSize;
  const where = { periodId: targetPeriodId };
  const keyword = input.keyword || "";

  if (keyword) {
    const all = await prisma.financeAccountBalance.findMany({
      where,
      include: { account: true },
      orderBy: { account: { code: "asc" } },
    });
    const filtered = all.filter(
      (balance) =>
        matchText(balance.account.code, keyword) ||
        matchText(balance.account.name, keyword),
    );
    const balances = filtered.slice(skip, skip + pageSize);
    const total = filtered.length;
    return {
      data: balances,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      balances,
    };
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

  return {
    data: balances,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    balances,
    periodId: targetPeriodId,
  };
}

export async function recomputeFinanceBalances(input: RecomputeFinanceBalancesInput) {
  const period = await prisma.financePeriod.findUnique({ where: { id: input.periodId } });
  if (!period) return { success: false, status: 404 as const, error: "期间不存在" };
  if (period.isClosed) return { success: false, status: 400 as const, error: "期间已结账，不能重新计算" };

  try {
    const result = await computeBalancesForPeriod(period.id);
    return { success: true, count: result.count };
  } catch (err) {
    const message = err instanceof Error ? err.message : "计算失败";
    return { success: false, status: 400 as const, error: message };
  }
}
