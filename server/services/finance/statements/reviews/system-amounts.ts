/**
 * P3 Batch 5: income statement systemAmount from voucher-item activity.
 *
 * Aggregates current-period debit/credit from FinanceAccountBalance,
 * matched by account code prefix per line config.
 *
 * Rules:
 *   direction=credit (revenue): amount = credit - debit
 *   direction=debit  (expense): amount = debit - credit
 *   subtract=true: amount = -amount
 *   header/total/grandTotal lines: amount = 0 (derived in report layer)
 */

import { prisma } from "@/lib/prisma";
import type { IncomeStatementLineRow } from "../config/load-config-reports";
import { loadIncomeStatementConfig } from "../config/load-config-reports";

/** Compute systemAmount for every income statement data line. */
export async function computeIncomeSystemAmounts(
  companyCode: string,
  year: number,
  month: number,
): Promise<Map<string, number>> {
  const period = await prisma.financePeriod.findUnique({
    where: { companyCode_year_month: { companyCode, year, month } },
  });
  if (!period) return new Map();

  const config = await loadIncomeStatementConfig(companyCode, year);
  return computeFromBalances(period.id, config);
}

/** Internal: given periodId and config, aggregate balances into systemAmounts. */
async function computeFromBalances(
  periodId: number,
  config: IncomeStatementLineRow[],
): Promise<Map<string, number>> {
  // Load all balances with account codes for this period
  const balances = await prisma.financeAccountBalance.findMany({
    where: { periodId },
    include: { account: { select: { code: true } } },
  });

  const result = new Map<string, number>();

  for (const line of config) {
    // Header / total / grandTotal: skip, systemAmount stays 0
    if (line.isHeader || line.isTotal || line.isGrandTotal || line.prefixes.length === 0) {
      result.set(line.lineCode, 0);
      continue;
    }

    // Leaf-only: collect matched codes, exclude parents whose child also matches
    const matched = new Set(balances.filter((b) =>
      line.prefixes.some((p) => b.account.code.startsWith(p)),
    ));
    const parents = new Set<string>();
    for (const a of matched) {
      for (const b of matched) {
        if (b.account.code !== a.account.code &&
            b.account.code.startsWith(a.account.code) &&
            b.account.code.length > a.account.code.length) {
          parents.add(a.account.code);
          break;
        }
      }
    }
    const leafBalances = [...matched].filter((b) => !parents.has(b.account.code));

    const totalDebit = leafBalances.reduce((s, b) => s + b.currentDebit, 0);
    const totalCredit = leafBalances.reduce((s, b) => s + b.currentCredit, 0);

    let amount: number;
    if (line.direction === "credit") {
      amount = totalCredit - totalDebit;
    } else {
      amount = totalDebit - totalCredit;
    }
    if (line.subtract) amount = -amount;

    result.set(line.lineCode, Math.round(amount * 100) / 100);
  }

  return result;
}
