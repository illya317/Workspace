/**
 * P3 Batch 5: income statement systemAmount from voucher-item activity.
 *
 * Aggregates debit/credit from FinanceVoucherItem (not FinanceAccountBalance,
 * because some companies have annual-snapshot balances with zero current activity).
 * Filters by voucher.periodId for the target month.
 *
 * Rules:
 *   direction=credit (revenue): amount = credit - debit
 *   direction=debit  (expense): amount = debit - credit
 *   subtract=true: amount = -amount
 *   header/total/grandTotal lines: amount = 0 (derived in report layer)
 */

import { prisma } from "@workspace/platform/server/prisma";
import type { IncomeStatementLineRow } from "../config/load-config-reports";
import { loadIncomeStatementConfig } from "../config/load-config-reports";

/** Compute systemAmount for every income statement data line from voucher items. */
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
  return computeFromVouchers(period.id, config);
}

async function computeFromVouchers(
  periodId: number,
  config: IncomeStatementLineRow[],
): Promise<Map<string, number>> {
  // Load all voucher items for this period with account codes
  const items = await prisma.financeVoucherItem.findMany({
    where: { voucher: { periodId } },
    include: { account: { select: { code: true } } },
  });
  const result = new Map<string, number>();

  for (const line of config) {
    if (line.isHeader || line.isTotal || line.isGrandTotal || line.prefixes.length === 0) {
      result.set(line.lineCode, 0);
      continue;
    }

    // Filter items matching any prefix
    const matched = items.filter((it) =>
      line.prefixes.some((p) => it.account.code.startsWith(p)),
    );

    // Leaf-only: exclude parents whose child also matched
    const codes = new Set(matched.map((it) => it.account.code));
    const parents = new Set<string>();
    for (const c1 of codes) {
      for (const c2 of codes) {
        if (c2 !== c1 && c2.startsWith(c1) && c2.length > c1.length) {
          parents.add(c1); break;
        }
      }
    }
    const leafItems = matched.filter((it) => !parents.has(it.account.code));

    let amount: number;
    if (line.direction === "credit") {
      // Revenue: sum credit entries only (debit entries are reversals/closing)
      amount = leafItems.reduce((s, it) => s + it.credit, 0);
    } else {
      // Expense: sum debit entries only (credit entries are reversals/closing)
      amount = leafItems.reduce((s, it) => s + it.debit, 0);
    }
    if (line.subtract) amount = -amount;

    result.set(line.lineCode, Math.round(amount * 100) / 100);
  }

  return result;
}
