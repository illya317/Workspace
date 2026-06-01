/**
 * Balance Residual Reclass — 余额层重分类
 *
 * 算法：residual = 期末异常余额 - 凭证明细已调金额
 * residual > 0 时写 FinanceBalanceReclassAdjustment
 * 与 ReclassResult 互补，不重复
 */
import { prisma } from "@/lib/prisma";

export async function syncBalanceReclassForPeriod(periodId: number): Promise<{ written: number; deleted: number }> {
  const period = await prisma.financePeriod.findUnique({ where: { id: periodId }, select: { companyCode: true, year: true, month: true } });
  if (!period?.companyCode) return { written: 0, deleted: 0 };

  // 1. 余额
  const balances = await prisma.financeAccountBalance.findMany({
    where: { periodId },
    include: { account: { select: { code: true, name: true, balanceDirection: true } } },
  });

  // 2. 叶子科目（排除有子科目的父科目）
  const codes = balances.map(b => b.account.code);
  const parentCodes = new Set<string>();
  for (const c1 of codes) {
    for (const c2 of codes) {
      if (c2 !== c1 && c2.startsWith(c1) && c2.length > c1.length) { parentCodes.add(c1); break; }
    }
  }
  const leafBalances = balances.filter(b => !parentCodes.has(b.account.code));

  // 3. 规则
  const rules = await prisma.financeReclassRule.findMany({
    where: { companyCode: period.companyCode, year: period.year, enabled: true },
  });
  const ruleMap = new Map<string, string>();
  for (const r of rules) ruleMap.set(`${r.sourceAccountCode}::${r.abnormalSide}`, r.targetAccountCode);

  // 4. Year-to-date voucher reclass sum（本年度所有 <= 当前月份）
  const ytdPeriods = await prisma.financePeriod.findMany({
    where: { companyCode: period.companyCode, year: period.year, month: { lte: period.month } },
    select: { id: true },
  });
  const ytdPeriodIds = ytdPeriods.map(p => p.id);
  const voucherReclass = await prisma.reclassResult.groupBy({
    by: ["sourceAccount"],
    where: { periodId: { in: ytdPeriodIds }, status: { in: ["approved", "adjusted"] } },
    _sum: { amount: true },
  });
  const voucherSum = new Map<string, number>();
  for (const v of voucherReclass) voucherSum.set(v.sourceAccount, v._sum.amount || 0);

  // 5. 已有 balance adjustment（保护 adjusted/rejected）
  const existing = await prisma.financeBalanceReclassAdjustment.findMany({
    where: { periodId },
  });
  const protectedAccounts = new Set(existing.filter(e => e.status === "adjusted" || e.status === "rejected").map(e => e.sourceAccountCode));

  let written = 0, deleted = 0;

  for (const b of leafBalances) {
    if (protectedAccounts.has(b.account.code)) continue;

    const dir = b.account.balanceDirection;
    let abnormalSide: string;
    let abnormalAmount: number;

    if (dir === "debit" && b.closingCredit > 0) {
      abnormalSide = "credit"; abnormalAmount = b.closingCredit;
    } else if (dir === "credit" && b.closingDebit > 0) {
      abnormalSide = "debit"; abnormalAmount = b.closingDebit;
    } else {
      // 无异常方向余额 → delete any existing auto adjustment
      const del = await prisma.financeBalanceReclassAdjustment.deleteMany({
        where: { periodId, sourceAccountCode: b.account.code, status: "approved" },
      });
      deleted += del.count;
      continue;
    }

    const target = ruleMap.get(`${b.account.code}::${abnormalSide}`);
    if (!target) {
      const del = await prisma.financeBalanceReclassAdjustment.deleteMany({
        where: { periodId, sourceAccountCode: b.account.code, status: "approved" },
      });
      deleted += del.count;
      continue;
    }

    const voucherAmount = voucherSum.get(b.account.code) || 0;
    const residual = abnormalAmount - voucherAmount;

    if (residual <= 0.005) {
      const del = await prisma.financeBalanceReclassAdjustment.deleteMany({
        where: { periodId, sourceAccountCode: b.account.code, status: "approved" },
      });
      deleted += del.count;
      continue;
    }

    await prisma.financeBalanceReclassAdjustment.upsert({
      where: { periodId_sourceAccountCode: { periodId, sourceAccountCode: b.account.code } },
      create: { periodId, companyCode: period.companyCode, year: period.year, sourceAccountCode: b.account.code, targetAccountCode: target, amount: Math.round(residual * 100) / 100, sourceType: "balance_residual" },
      update: { targetAccountCode: target, amount: Math.round(residual * 100) / 100, companyCode: period.companyCode, year: period.year },
    });
    written++;
  }

  return { written, deleted };
}

export async function syncBalanceReclassForYear(companyCode: string, year: number) {
  const periods = await prisma.financePeriod.findMany({
    where: { companyCode, year },
    select: { id: true },
  });
  let totalWritten = 0, totalDeleted = 0;
  for (const p of periods) {
    const r = await syncBalanceReclassForPeriod(p.id);
    totalWritten += r.written;
    totalDeleted += r.deleted;
  }
  return { periods: periods.length, written: totalWritten, deleted: totalDeleted };
}
