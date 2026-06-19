import { prisma } from "@workspace/platform/server/prisma";

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

export interface ReclassAdjustment {
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  status: string;
  type: "deduction" | "addition";
}

export interface DetailResult {
  details: AccountDetail[];
  total: number;
  /** Reclass adjustments affecting these codes (deductions from source, additions to target) */
  reclassAdjustments?: ReclassAdjustment[];
  /** Total reclass impact on these codes */
  reclassImpact?: number;
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
      code: b.account.code, name: b.account.name,
      category: b.account.category, balanceDirection: b.account.balanceDirection,
      openingDebit: b.openingDebit, openingCredit: b.openingCredit,
      currentDebit: b.currentDebit, currentCredit: b.currentCredit,
      closing,
    };
  });

  // Fetch reclass adjustments for this period
  const reclassRows = await prisma.reclassResult.findMany({
    where: { periodId: period.id, status: { in: ["approved", "adjusted"] } },
    select: { sourceAccount: true, targetAccount: true, amount: true, status: true },
  });

  const reclassAdjustments: ReclassAdjustment[] = [];
  let reclassImpact = 0;

  for (const rr of reclassRows) {
    const sourceMatch = params.codes.some((code) => rr.sourceAccount.startsWith(code));
    const targetMatch = params.codes.some((code) => rr.targetAccount.startsWith(code));

    if (sourceMatch) {
      reclassAdjustments.push({
        sourceAccount: rr.sourceAccount, targetAccount: rr.targetAccount,
        amount: rr.amount, status: rr.status, type: "deduction",
      });
      // Asset source deduction = reduce asset (negative impact)
      // Liability source deduction = reduce liability (positive impact from liability perspective)
      reclassImpact -= rr.sourceAccount.startsWith("1") ? rr.amount : -rr.amount;
    }
    if (targetMatch) {
      reclassAdjustments.push({
        sourceAccount: rr.sourceAccount, targetAccount: rr.targetAccount,
        amount: rr.amount, status: rr.status, type: "addition",
      });
      // Asset→Liability target = add to liability (positive from liability perspective)
      reclassImpact += rr.sourceAccount.startsWith("1") ? rr.amount : -rr.amount;
    }
  }

  const total = details.reduce((s, d) => s + d.closing, 0);
  if (reclassAdjustments.length > 0) {
    return { details, total, reclassAdjustments, reclassImpact };
  }
  return { details, total };
}
