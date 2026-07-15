import { prisma } from "@workspace/platform/server/prisma";
import { hasSubmittedStatementWorkpaper } from "./workpaper-source";

export interface DetailParams {
  companyCode: string;
  year: number;
  month: number;
  codes: string[]; // account code prefixes (split from +, -, or ,)
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

interface BalanceAdjustmentRow {
  sourceAccountCode: string;
  targetAccountCode: string;
  amount: number;
  status: string;
}

export async function getReportDetail(params: DetailParams): Promise<DetailResult> {
  const [period, previousPeriod] = await Promise.all([
    prisma.financePeriod.findFirst({
      where: { companyCode: params.companyCode, year: params.year, month: params.month },
    }),
    prisma.financePeriod.findFirst({
      where: { companyCode: params.companyCode, year: params.year - 1, month: params.month },
    }),
  ]);
  if (!period) return { details: [], total: 0 };

  const [balances, previousBalances, currentAdjustments, previousAdjustments, currentWorkpaper, previousWorkpaper] = await Promise.all([
    loadBalances(period.id),
    previousPeriod ? loadBalances(previousPeriod.id) : Promise.resolve([]),
    loadBalanceAdjustments(period.id),
    previousPeriod ? loadBalanceAdjustments(previousPeriod.id) : Promise.resolve([]),
    loadBalanceWorkpaper(params.companyCode, params.year, params.month),
    loadBalanceWorkpaper(params.companyCode, params.year - 1, params.month),
  ]);

  const matched = balances.filter((balance) => matchesCodes(balance.account.code, params.codes));
  const allCodes = matched.map((balance) => balance.account.code);
  const hasChildren = (code: string) => allCodes.some((candidate) => candidate.startsWith(code) && candidate.length > code.length);
  const leaves = matched.filter((balance) => !hasChildren(balance.account.code));

  const previousClosingByCode = new Map(previousBalances.map((balance) => [
    balance.account.code,
    closingAmount(balance),
  ]));
  const usePreviousWorkpaper = Boolean(currentWorkpaper && previousWorkpaper);
  const accountDetails: AccountDetail[] = leaves.map((balance) => {
    const opening = currentWorkpaper
      ? usePreviousWorkpaper ? previousClosingByCode.get(balance.account.code) ?? 0 : 0
      : balance.openingDebit - balance.openingCredit;
    const closing = closingAmount(balance);
    return {
      code: balance.account.code,
      name: balance.account.name,
      category: balance.account.category,
      balanceDirection: balance.account.balanceDirection,
      openingDebit: Math.max(opening, 0),
      openingCredit: Math.max(-opening, 0),
      currentDebit: Math.max(money(closing - opening), 0),
      currentCredit: Math.max(money(opening - closing), 0),
      closing,
    };
  });

  const reclassAdjustments: ReclassAdjustment[] = [];
  let reclassImpact = 0;
  for (const row of currentAdjustments) {
    const sourceMatch = matchesCodes(row.sourceAccountCode, params.codes);
    const targetMatch = matchesCodes(row.targetAccountCode, params.codes);
    if (sourceMatch) {
      reclassAdjustments.push({
        sourceAccount: row.sourceAccountCode,
        targetAccount: row.targetAccountCode,
        amount: row.amount,
        status: row.status,
        type: "deduction",
      });
      reclassImpact += presentationAmount(row.sourceAccountCode, row.amount);
    }
    if (targetMatch) {
      reclassAdjustments.push({
        sourceAccount: row.sourceAccountCode,
        targetAccount: row.targetAccountCode,
        amount: row.amount,
        status: row.status,
        type: "addition",
      });
      reclassImpact += presentationAmount(row.targetAccountCode, row.amount);
    }
  }

  const adjustmentDetails = buildAdjustmentDetails(
    params.codes,
    usePreviousWorkpaper ? previousAdjustments : [],
    currentAdjustments,
  );
  const details = [...accountDetails, ...adjustmentDetails];
  const total = details.reduce((sum, detail) => sum + detail.closing, 0);
  if (reclassAdjustments.length > 0) return { details, total, reclassAdjustments, reclassImpact };
  return { details, total };
}

function loadBalances(periodId: number) {
  return prisma.financeAccountBalance.findMany({
    where: { periodId },
    include: { account: true },
    orderBy: { account: { code: "asc" as const } },
  });
}

function loadBalanceWorkpaper(companyCode: string, year: number, month: number) {
  return hasSubmittedStatementWorkpaper({
    companyCode,
    year,
    month,
    reportType: "balanceSheet",
  });
}

function closingAmount(balance: {
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
}) {
  return money(balance.openingDebit - balance.openingCredit + balance.currentDebit - balance.currentCredit);
}

function loadBalanceAdjustments(periodId: number): Promise<BalanceAdjustmentRow[]> {
  return prisma.financeBalanceReclassAdjustment.findMany({
    where: { periodId, status: { in: ["approved", "adjusted"] } },
    select: {
      sourceAccountCode: true,
      targetAccountCode: true,
      amount: true,
      status: true,
    },
  });
}

function matchesCodes(accountCode: string, codes: string[]) {
  return codes.some((code) => accountCode.startsWith(code));
}

function presentationAmount(accountCode: string, amount: number) {
  return accountCode.startsWith("2") ? -amount : amount;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildAdjustmentDetails(
  codes: string[],
  previousRows: BalanceAdjustmentRow[],
  currentRows: BalanceAdjustmentRow[],
): AccountDetail[] {
  const values = new Map<string, {
    sourceAccountCode: string;
    targetAccountCode: string;
    role: "source" | "target";
    opening: number;
    closing: number;
  }>();

  const add = (row: BalanceAdjustmentRow, period: "opening" | "closing") => {
    for (const role of ["source", "target"] as const) {
      const accountCode = role === "source" ? row.sourceAccountCode : row.targetAccountCode;
      if (!matchesCodes(accountCode, codes)) continue;
      const key = `${role}:${row.sourceAccountCode}->${row.targetAccountCode}`;
      const value = values.get(key) ?? {
        sourceAccountCode: row.sourceAccountCode,
        targetAccountCode: row.targetAccountCode,
        role,
        opening: 0,
        closing: 0,
      };
      value[period] = money(value[period] + presentationAmount(accountCode, row.amount));
      values.set(key, value);
    }
  };

  previousRows.forEach((row) => add(row, "opening"));
  currentRows.forEach((row) => add(row, "closing"));

  return [...values.values()].map((value) => {
    const movement = money(value.closing - value.opening);
    const directionAmount = value.closing || value.opening;
    return {
      code: `R-${value.role}-${value.sourceAccountCode}-${value.targetAccountCode}`,
      name: `重分类调整：${value.sourceAccountCode} → ${value.targetAccountCode}`,
      category: "reclass",
      balanceDirection: directionAmount < 0 ? "credit" : "debit",
      openingDebit: Math.max(value.opening, 0),
      openingCredit: Math.max(-value.opening, 0),
      currentDebit: Math.max(movement, 0),
      currentCredit: Math.max(-movement, 0),
      closing: value.closing,
    };
  });
}
