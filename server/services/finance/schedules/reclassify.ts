import { prisma } from "@/lib/prisma";

export interface ReclassEntry {
  accountCode: string;
  accountName: string;
  fromSide: "asset" | "liability";
  toSide: "liability" | "asset";
  closingDebit: number;
  closingCredit: number;
  netAmount: number;
  reason: string;
}

export interface ReclassResult {
  entries: ReclassEntry[];
  summaryByFrom: { fromSide: string; count: number; totalAmount: number }[];
}

export async function computeReclassification(
  companyCode: string,
  year: number,
  month: number,
): Promise<ReclassResult> {
  const period = await prisma.financePeriod.findFirst({
    where: { companyCode, year, month },
  });
  if (!period) return { entries: [], summaryByFrom: [] };

  const balances = await prisma.financeAccountBalance.findMany({
    where: { periodId: period.id },
    include: { account: true },
  });

  // Leaf-only filtering
  const codes = balances.map((b) => b.account.code);
  const parentCodes = new Set<string>();
  for (const c1 of codes) {
    for (const c2 of codes) {
      if (c2 !== c1 && c2.startsWith(c1) && c2.length > c1.length) {
        parentCodes.add(c1);
        break;
      }
    }
  }

  const entries: ReclassEntry[] = [];
  for (const b of balances) {
    if (parentCodes.has(b.account.code)) continue;
    const net = b.closingDebit - b.closingCredit;

    // 1xxx asset with net credit → should be liability
    if (b.account.code.startsWith("1") && net < -0.01) {
      entries.push({
        accountCode: b.account.code,
        accountName: b.account.name,
        fromSide: "asset",
        toSide: "liability",
        closingDebit: b.closingDebit,
        closingCredit: b.closingCredit,
        netAmount: net,
        reason: `资产科目贷方余额（${b.closingCredit.toFixed(2)}），重分类至负债侧`,
      });
    }
    // 2xxx liability with net debit → should be asset
    if (b.account.code.startsWith("2") && net > 0.01) {
      entries.push({
        accountCode: b.account.code,
        accountName: b.account.name,
        fromSide: "liability",
        toSide: "asset",
        closingDebit: b.closingDebit,
        closingCredit: b.closingCredit,
        netAmount: net,
        reason: `负债科目借方余额（${b.closingDebit.toFixed(2)}），重分类至资产侧`,
      });
    }
  }

  const summaryByFrom = ["asset", "liability"].map((side) => {
    const matched = entries.filter((e) => e.fromSide === side);
    return {
      fromSide: side,
      count: matched.length,
      totalAmount: matched.reduce((s, e) => s + Math.abs(e.netAmount), 0),
    };
  });

  return { entries, summaryByFrom };
}
