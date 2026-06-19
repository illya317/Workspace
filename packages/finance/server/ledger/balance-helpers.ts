import { prisma } from "@workspace/platform/server/prisma";
import { addToMap, type FinanceAccountLike, type SideBalance } from "./balance-utils";

export async function getOrCreatePeriod(companyCode: string, year: number, month: number) {
  const existing = await prisma.financePeriod.findFirst({
    where: { companyCode, year, month },
  });
  if (existing) return existing;

  const lastDay = new Date(year, month, 0).getDate();
  return prisma.financePeriod.create({
    data: {
      companyCode,
      year,
      month,
      startDate: `${year}-${String(month).padStart(2, "0")}-01`,
      endDate: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
    },
  });
}

export async function getAccounts(companyCode: string, year: number): Promise<FinanceAccountLike[]> {
  return prisma.financeAccount.findMany({
    where: { companyCode, year, isActive: true },
    select: { id: true, code: true, parentId: true, balanceDirection: true },
    orderBy: { code: "asc" },
  });
}

export async function getMonthlyCurrent(companyCode: string, year: number, month: number) {
  const items = await prisma.financeVoucherItem.findMany({
    where: {
      voucher: { companyCode, status: "posted", period: { year, month, companyCode } },
    },
    include: { account: true },
  });
  const direct = new Map<string, SideBalance>();
  for (const item of items) {
    addToMap(direct, item.account.code, item.debit, item.credit);
  }
  return direct;
}

export async function getRangeCurrent(companyCode: string, year: number, monthStart: number, monthEnd: number) {
  const items = await prisma.financeVoucherItem.findMany({
    where: {
      voucher: { companyCode, status: "posted", period: { year, month: { gte: monthStart, lte: monthEnd }, companyCode } },
    },
    include: { account: true },
  });
  const direct = new Map<string, SideBalance>();
  for (const item of items) {
    addToMap(direct, item.account.code, item.debit, item.credit);
  }
  return direct;
}
