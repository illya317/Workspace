import { prisma } from "@workspace/platform/server/prisma";
import type { IncomeStatementLineRow } from "../config/load-config-reports";
import { loadIncomeStatementConfig } from "../config/load-config-reports";

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
