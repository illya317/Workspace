import { prisma } from "@workspace/platform/server/prisma";
import type { IncomeStatementLineRow } from "../config/load-config-reports";
import { loadIncomeStatementConfig } from "../config/load-config-reports";

interface IncomeVoucherItemFact {
  debit: number;
  credit: number;
  account: { code: string };
}

function computeFromItems(
  items: readonly IncomeVoucherItemFact[],
  config: readonly IncomeStatementLineRow[],
) {
  const result = new Map<string, number>();

  for (const line of config) {
    if (line.isHeader || line.isTotal || line.isGrandTotal || line.prefixes.length === 0) {
      result.set(line.lineCode, 0);
      continue;
    }
    const matched = items.filter((item) =>
      line.prefixes.some((prefix) => item.account.code.startsWith(prefix)),
    );
    const codes = new Set(matched.map((item) => item.account.code));
    const parents = new Set<string>();
    for (const candidate of codes) {
      if ([...codes].some((code) => code !== candidate && code.startsWith(candidate))) {
        parents.add(candidate);
      }
    }
    const leafItems = matched.filter((item) => !parents.has(item.account.code));
    const amount = line.direction === "credit"
      ? leafItems.reduce((sum, item) => sum + item.credit, 0)
      : leafItems.reduce((sum, item) => sum + item.debit, 0);
    result.set(line.lineCode, Math.round(amount * 100) / 100);
  }

  return result;
}

export async function computeIncomeSystemAmounts(
  companyCode: string,
  year: number,
  month: number,
  config?: IncomeStatementLineRow[],
  periodBasis: "yearToDate" | "month" = "yearToDate",
): Promise<Map<string, number>> {
  const lines = config ?? await loadIncomeStatementConfig(companyCode, year);
  return computeFromVouchers(companyCode, year, month, lines, periodBasis);
}

async function computeFromVouchers(
  companyCode: string,
  year: number,
  month: number,
  config: IncomeStatementLineRow[],
  periodBasis: "yearToDate" | "month",
): Promise<Map<string, number>> {
  const items = await prisma.financeVoucherItem.findMany({
    where: {
      voucher: {
        status: "posted",
        statementExclusions: { none: { statementType: "income", enabled: true } },
        period: {
          companyCode,
          year,
          month: periodBasis === "month" ? month : { lte: month },
        },
      },
    },
    include: { account: { select: { code: true } } },
  });
  return computeFromItems(items, config);
}

export async function computeIncomeMonthlySystemAmounts(
  companyCode: string,
  year: number,
  throughMonth: number,
  config: IncomeStatementLineRow[],
) {
  const items = await prisma.financeVoucherItem.findMany({
    where: {
      voucher: {
        status: "posted",
        statementExclusions: { none: { statementType: "income", enabled: true } },
        period: { companyCode, year, month: { lte: throughMonth } },
      },
    },
    include: {
      account: { select: { code: true } },
      voucher: { select: { period: { select: { month: true } } } },
    },
  });
  const itemsByMonth = new Map<number, IncomeVoucherItemFact[]>();
  for (const item of items) {
    const monthItems = itemsByMonth.get(item.voucher.period.month) ?? [];
    monthItems.push(item);
    itemsByMonth.set(item.voucher.period.month, monthItems);
  }
  return new Map(Array.from({ length: throughMonth }, (_, index) => {
    const month = index + 1;
    return [month, computeFromItems(itemsByMonth.get(month) ?? [], config)] as const;
  }));
}
