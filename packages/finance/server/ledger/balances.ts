import { prisma } from "@workspace/platform/server/prisma";
import {
  type ComputedBalance,
  type SideBalance,
  rollUpByParent,
  toSides,
} from "./balance-utils";
import {
  findActiveBaselineYear,
  loadActiveBaselineClosing,
  materializeBaselineToPeriod,
} from "./annual-balances";
import {
  getAccounts,
  getMonthlyCurrent,
  getOrCreatePeriod,
  getRangeCurrent,
} from "./balance-helpers";

export async function computeBalancesForPeriod(periodId: number) {
  const targetPeriod = await prisma.financePeriod.findUnique({ where: { id: periodId } });
  if (!targetPeriod?.companyCode) throw new Error("期间不存在或缺少公司编码");
  if (targetPeriod.isClosed) throw new Error("期间已结账，不能重新计算");

  // 查找 active baseline year
  const baselineYear = await findActiveBaselineYear(targetPeriod.companyCode, targetPeriod.year);
  if (!baselineYear) {
    throw new Error(`请先为公司 ${targetPeriod.companyCode} 导入年度余额表作为 active baseline`);
  }

  // 基准年份只允许重算 12 月（materialize 快照），其余月份无计算基础
  if (targetPeriod.year === baselineYear && targetPeriod.month !== 12) {
    throw new Error(
      `基准年份 ${baselineYear} 只支持重算 12 月（年度快照 materialize）。` +
      `${targetPeriod.month} 月请先从 12 月基准开始逐月滚动，或改用后续年份。`,
    );
  }

  // baseline 年份的 12 月：直接 materialize 快照
  if (targetPeriod.year === baselineYear && targetPeriod.month === 12) {
    const { results } = await materializeBaselineToPeriod(targetPeriod.companyCode, baselineYear, getOrCreatePeriod);
    return { count: results.length };
  }

  // 从 baseline closing 开始
  let openingMap = await loadActiveBaselineClosing(targetPeriod.companyCode, baselineYear);
  const startYear = baselineYear + 1;
  let latestResults: ComputedBalance[] = [];

  for (let year = startYear; year <= targetPeriod.year; year++) {
    const maxMonth = year === targetPeriod.year ? targetPeriod.month : 12;
    for (let month = 1; month <= maxMonth; month++) {
      const period = await getOrCreatePeriod(targetPeriod.companyCode, year, month);
      if (period.isClosed) {
        openingMap = new Map();
        const existing = await prisma.financeAccountBalance.findMany({
          where: { periodId: period.id },
          include: { account: true },
        });
        for (const row of existing) {
          openingMap.set(row.account.code, { debit: row.closingDebit, credit: row.closingCredit });
        }
        continue;
      }

      const accounts = await getAccounts(targetPeriod.companyCode, year);
      const directCurrent = await getMonthlyCurrent(targetPeriod.companyCode, year, month);
      const currentMap = rollUpByParent(accounts, directCurrent);
      const nextOpening = new Map<string, SideBalance>();
      const monthResults: ComputedBalance[] = [];

      for (const account of accounts) {
        const opening = openingMap.get(account.code) || { debit: 0, credit: 0 };
        const current = currentMap.get(account.code) || { debit: 0, credit: 0 };
        const closing = toSides(
          account.balanceDirection,
          opening.debit,
          opening.credit,
          current.debit,
          current.credit,
        );

        await prisma.financeAccountBalance.upsert({
          where: { accountId_periodId: { accountId: account.id, periodId: period.id } },
          update: {
            openingDebit: opening.debit,
            openingCredit: opening.credit,
            currentDebit: current.debit,
            currentCredit: current.credit,
            closingDebit: closing.debit,
            closingCredit: closing.credit,
            companyCode: targetPeriod.companyCode,
          },
          create: {
            accountId: account.id,
            periodId: period.id,
            openingDebit: opening.debit,
            openingCredit: opening.credit,
            currentDebit: current.debit,
            currentCredit: current.credit,
            closingDebit: closing.debit,
            closingCredit: closing.credit,
            companyCode: targetPeriod.companyCode,
          },
        });

        nextOpening.set(account.code, closing);
        monthResults.push({
          accountId: account.id,
          accountCode: account.code,
          openingDebit: opening.debit,
          openingCredit: opening.credit,
          currentDebit: current.debit,
          currentCredit: current.credit,
          closingDebit: closing.debit,
          closingCredit: closing.credit,
        });
      }

      openingMap = nextOpening;
      latestResults = monthResults;
    }
  }

  return { count: latestResults.length };
}

export async function computeAnnualComparisonBase(
  companyCode: string,
  year: number,
  monthStart: number,
  monthEnd: number,
) {
  // baseline 年份全年：直接从 snapshot rows 返回
  const baselineYear = await findActiveBaselineYear(companyCode, year + 1);
  if (baselineYear && year === baselineYear && monthStart === 1 && monthEnd === 12) {
    const snapshot = await prisma.financeBalanceSnapshot.findFirst({
      where: { companyCode, year, snapshotType: "baseline", isActive: true },
      include: { rows: { include: { account: true } } },
    });
    if (snapshot) {
      const result = new Map<string, ComputedBalance>();
      for (const row of snapshot.rows) {
        result.set(row.accountCode, {
          accountId: row.accountId,
          accountCode: row.accountCode,
          openingDebit: row.openingDebit,
          openingCredit: row.openingCredit,
          currentDebit: row.currentDebit,
          currentCredit: row.currentCredit,
          closingDebit: row.closingDebit,
          closingCredit: row.closingCredit,
        });
      }
      return result;
    }
  }

  // 非 baseline 年份：计算月度范围余额
  const endPeriod = await getOrCreatePeriod(companyCode, year, monthEnd);
  await computeBalancesForPeriod(endPeriod.id);

  const [startPeriod, endBalances, accounts] = await Promise.all([
    getOrCreatePeriod(companyCode, year, monthStart),
    prisma.financeAccountBalance.findMany({
      where: { periodId: endPeriod.id },
      include: { account: true },
    }),
    getAccounts(companyCode, year),
  ]);

  const startBalances = await prisma.financeAccountBalance.findMany({
    where: { periodId: startPeriod.id },
    include: { account: true },
  });
  const startMap = new Map(startBalances.map((row) => [row.account.code, row]));
  const endMap = new Map(endBalances.map((row) => [row.account.code, row]));
  const currentMap = rollUpByParent(accounts, await getRangeCurrent(companyCode, year, monthStart, monthEnd));

  const result = new Map<string, ComputedBalance>();
  for (const account of accounts) {
    const start = startMap.get(account.code);
    const end = endMap.get(account.code);
    const current = currentMap.get(account.code) || { debit: 0, credit: 0 };
    result.set(account.code, {
      accountId: account.id,
      accountCode: account.code,
      openingDebit: start?.openingDebit || 0,
      openingCredit: start?.openingCredit || 0,
      currentDebit: current.debit,
      currentCredit: current.credit,
      closingDebit: end?.closingDebit || 0,
      closingCredit: end?.closingCredit || 0,
    });
  }

  return result;
}
