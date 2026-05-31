import { prisma } from "@/lib/prisma";

export interface DetailParams {
  companyCode: string;
  year: number;
  month: number;
  codes: string[]; // account code prefixes (split from + or ,)
}

export interface AccountDetail {
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closing: number;
}

export interface DetailResult {
  details: AccountDetail[];
  total: number;
}

export async function getReportDetail(params: DetailParams): Promise<DetailResult> {
  const period = await prisma.financePeriod.findFirst({
    where: { companyCode: params.companyCode, year: params.year, month: params.month },
  });
  if (!period) return { details: [], total: 0 };

  const balances = await prisma.financeAccountBalance.findMany({
    where: { periodId: period.id },
    include: { account: true },
    orderBy: { account: { code: "asc" } },
  });

  // Filter balances whose account code starts with any requested code
  const matched = balances.filter((b) =>
    params.codes.some((code) => b.account.code.startsWith(code))
  );

  // Only show leaf accounts (exclude parent if children exist)
  const allCodes = matched.map((b) => b.account.code);
  const hasChildren = (code: string) => allCodes.some((c) => c.startsWith(code) && c.length > code.length);
  const leaves = matched.filter((b) => !hasChildren(b.account.code));

  const details: AccountDetail[] = leaves.map((b) => {
    const closing = b.openingDebit - b.openingCredit + b.currentDebit - b.currentCredit;
    return {
      code: b.account.code,
      name: b.account.name,
      category: b.account.category,
      balanceDirection: b.account.balanceDirection,
      openingDebit: b.openingDebit,
      openingCredit: b.openingCredit,
      currentDebit: b.currentDebit,
      currentCredit: b.currentCredit,
      closing,
    };
  });

  return { details, total: details.reduce((s, d) => s + d.closing, 0) };
}
