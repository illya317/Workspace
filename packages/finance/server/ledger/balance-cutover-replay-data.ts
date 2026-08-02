import { prisma } from "@workspace/platform/server/prisma";

import type {
  FinanceBalanceCutoverReplayDependencies,
  FinanceBalanceCutoverReplayScope,
} from "./balance-cutover-replay-contract";

export const financeBalanceCutoverReplayDependencies: FinanceBalanceCutoverReplayDependencies = {
  loadFacts: async (scope: FinanceBalanceCutoverReplayScope) => {
    const period = await prisma.financePeriod.findUnique({
      where: { companyCode_year_month: scope },
      select: {
        id: true,
        companyCode: true,
        year: true,
        month: true,
        endDate: true,
        sourceSystem: true,
        sourceDatabase: true,
      },
    });
    if (!period) return null;
    const [accounts, sourceRows, cachedBalances, vouchers] = await Promise.all([
      prisma.financeAccount.findMany({
        where: { companyCode: scope.companyCode, year: scope.year, isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          parentId: true,
          balanceDirection: true,
          companyCode: true,
          year: true,
          isActive: true,
        },
        orderBy: [{ code: "asc" }, { id: "asc" }],
      }),
      prisma.financeSourceAccountBalance.findMany({
        where: { periodId: period.id },
        select: {
          id: true,
          importId: true,
          accountId: true,
          companyCode: true,
          sourceSystem: true,
          sourceDatabase: true,
          sourceKey: true,
          openingDebit: true,
          openingCredit: true,
          currentDebit: true,
          currentCredit: true,
          closingDebit: true,
          closingCredit: true,
          account: { select: { id: true, code: true, name: true, companyCode: true, year: true, isActive: true } },
          import: { select: { id: true, status: true, batchKey: true, sourceSystem: true, sourceDatabase: true, cutoffDate: true, checksum: true } },
        },
        orderBy: [{ account: { code: "asc" } }, { id: "asc" }],
      }),
      prisma.financeAccountBalance.findMany({
        where: { periodId: period.id },
        select: {
          id: true,
          accountId: true,
          openingDebit: true,
          openingCredit: true,
          currentDebit: true,
          currentCredit: true,
          closingDebit: true,
          closingCredit: true,
          account: { select: { id: true, code: true, name: true, companyCode: true, year: true, isActive: true } },
        },
        orderBy: [{ account: { code: "asc" } }, { id: "asc" }],
      }),
      prisma.financeVoucher.findMany({
        where: { periodId: period.id },
        select: {
          id: true,
          voucherNo: true,
          status: true,
          companyCode: true,
          totalDebit: true,
          totalCredit: true,
          items: {
            select: {
              id: true,
              accountId: true,
              debit: true,
              credit: true,
              account: { select: { id: true, code: true, name: true, companyCode: true, year: true, isActive: true } },
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: { id: "asc" },
      }),
    ]);
    return {
      period,
      accounts,
      sourceBalances: sourceRows.map((row) => ({
        ...row,
        openingDebit: Number(row.openingDebit),
        openingCredit: Number(row.openingCredit),
        currentDebit: Number(row.currentDebit),
        currentCredit: Number(row.currentCredit),
        closingDebit: Number(row.closingDebit),
        closingCredit: Number(row.closingCredit),
      })),
      cachedBalances,
      vouchers,
    };
  },
};
