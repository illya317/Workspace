import { prisma } from "@workspace/platform/server/prisma";
import { findBalanceSheetOpeningReclassPeriodId } from "./balance-sheet-reclass-entries";
import {
  balanceSheetOpeningPoint,
  type StatementPeriodKind,
} from "@workspace/finance/types/statement-period";

export interface DetailParams {
  companyCode: string;
  year: number;
  month: number;
  periodKind?: StatementPeriodKind;
  reportType?: "balance" | "income";
  direction?: "debit" | "credit";
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
  currentMonthAmount?: number;
  amount?: number;
  previousAmount?: number;
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

export interface BalanceAdjustmentRow {
  sourceAccountCode: string;
  targetAccountCode: string;
  amount: number;
  status: string;
}

export async function getReportDetail(params: DetailParams): Promise<DetailResult> {
  if (params.reportType === "income") return getIncomeReportDetail(params);
  const period = await prisma.financePeriod.findFirst({
    where: { companyCode: params.companyCode, year: params.year, month: params.month },
  });
  if (!period) return { details: [], total: 0 };
  const openingPoint = balanceSheetOpeningPoint(period);
  const openingPeriod = openingPoint.year === period.year && openingPoint.month === period.month
    ? period
    : await prisma.financePeriod.findFirst({
        where: {
          companyCode: params.companyCode,
          year: openingPoint.year,
          month: openingPoint.month,
        },
      });
  if (!openingPeriod) throw new Error("资产负债表期初期间不存在");

  const balancesPromise = loadBalances(period.id);
  const openingBalancesPromise = openingPeriod.id === period.id
    ? balancesPromise
    : loadBalances(openingPeriod.id);
  const [balances, openingBalances, currentAdjustments, previousPeriodId] = await Promise.all([
    balancesPromise,
    openingBalancesPromise,
    loadBalanceAdjustments(period.id),
    findBalanceSheetOpeningReclassPeriodId(period),
  ]);
  const previousAdjustments = previousPeriodId
    ? await loadBalanceAdjustments(previousPeriodId)
    : [];

  const matched = balances.filter((balance) => matchesCodes(balance.account.code, params.codes));
  const allCodes = matched.map((balance) => balance.account.code);
  const hasChildren = (code: string) => allCodes.some((candidate) => candidate.startsWith(code) && candidate.length > code.length);
  const leaves = matched.filter((balance) => !hasChildren(balance.account.code));
  const openingByCode = new Map(openingBalances.map((balance) => [balance.account.code, balance]));

  const accountDetails: AccountDetail[] = leaves.map((balance) => {
    const openingBalance = openingByCode.get(balance.account.code);
    const opening = openingBalance
      ? openingBalance.openingDebit - openingBalance.openingCredit
      : 0;
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
    previousAdjustments,
    currentAdjustments,
  );
  const details = [...accountDetails, ...adjustmentDetails];
  const total = details.reduce((sum, detail) => sum + detail.closing, 0);
  if (reclassAdjustments.length > 0) return { details, total, reclassAdjustments, reclassImpact };
  return { details, total };
}

async function getIncomeReportDetail(params: DetailParams): Promise<DetailResult> {
  const direction = params.direction ?? "debit";
  const [currentMonth, currentYear, previousYear] = await Promise.all([
    loadIncomeAccountAmounts(params.companyCode, params.year, params.month, params.codes, direction, "month"),
    loadIncomeAccountAmounts(params.companyCode, params.year, params.month, params.codes, direction, "yearToDate"),
    loadIncomeAccountAmounts(params.companyCode, params.year - 1, params.month, params.codes, direction, "yearToDate"),
  ]);
  const codes = [...new Set([...currentMonth.keys(), ...currentYear.keys(), ...previousYear.keys()])].sort();
  const details = codes.map((code): AccountDetail => {
    const source = currentMonth.get(code) ?? currentYear.get(code) ?? previousYear.get(code)!;
    return {
      code,
      name: source.name,
      category: source.category,
      balanceDirection: source.balanceDirection,
      openingDebit: 0,
      openingCredit: 0,
      currentDebit: 0,
      currentCredit: 0,
      closing: 0,
      currentMonthAmount: currentMonth.get(code)?.amount ?? 0,
      amount: currentYear.get(code)?.amount ?? 0,
      previousAmount: previousYear.get(code)?.amount ?? 0,
    };
  });
  return { details, total: money(details.reduce((sum, detail) => sum + (detail.amount ?? 0), 0)) };
}

async function loadIncomeAccountAmounts(
  companyCode: string,
  year: number,
  month: number,
  codes: string[],
  direction: "debit" | "credit",
  periodBasis: "yearToDate" | "month",
) {
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
      account: { OR: codes.map((code) => ({ code: { startsWith: code } })) },
    },
    include: { account: true },
  });
  const matchedCodes = new Set(items.map((item) => item.account.code));
  const parentCodes = new Set([...matchedCodes].filter((candidate) => (
    [...matchedCodes].some((code) => code !== candidate && code.startsWith(candidate))
  )));
  const amounts = new Map<string, {
    name: string;
    category: string;
    balanceDirection: string;
    amount: number;
  }>();
  for (const item of items) {
    if (parentCodes.has(item.account.code)) continue;
    const current = amounts.get(item.account.code) ?? {
      name: item.account.name,
      category: item.account.category,
      balanceDirection: item.account.balanceDirection,
      amount: 0,
    };
    current.amount = money(current.amount + (direction === "credit" ? item.credit : item.debit));
    amounts.set(item.account.code, current);
  }
  return amounts;
}

function loadBalances(periodId: number) {
  return prisma.financeAccountBalance.findMany({
    where: { periodId },
    include: { account: true },
    orderBy: { account: { code: "asc" as const } },
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

async function loadBalanceAdjustments(periodId: number): Promise<BalanceAdjustmentRow[]> {
  const rows = await prisma.financeBalanceReclassAdjustment.findMany({
    where: {
      periodId,
      decision: "reclassify",
      targetAccountCode: { not: null },
      status: { in: ["approved", "adjusted"] },
    },
    select: {
      sourceAccountCode: true,
      targetAccountCode: true,
      amount: true,
      status: true,
    },
  });
  return rows.flatMap((row) => row.targetAccountCode ? [{ ...row, targetAccountCode: row.targetAccountCode }] : []);
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

export function buildAdjustmentDetails(
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
