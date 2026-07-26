import { prisma } from "@workspace/platform/server/prisma";
import { BALANCE_SHEET_LINES } from "../statements/config/balance-sheet-lines";
import { INCOME_STATEMENT_LINES } from "../statements/config/income-statement-lines";
import type { ManagementFactSource } from "@workspace/finance/types";
import { roundMoney, type AmountMap } from "./management-calculation";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";
import { loadCashFlowConfig } from "../statements/config/load-config-reports";
import { computeCashFlowSystemAmounts } from "../statements/reports/cash-flow-system-amounts";
import { costStructureTotalCost } from "../cost/cost-structure-products";

export interface CompanyStatementFacts {
  income: AmountMap;
  priorIncome: AmountMap;
  balance: AmountMap;
  priorBalance: AmountMap;
  cashFlow: AmountMap;
  incomeSource: ManagementFactSource;
  balanceSource: ManagementFactSource;
  priorIncomeSource: ManagementFactSource;
  priorBalanceSource: ManagementFactSource;
}

function leafCodes(codes: string[]) {
  const unique = [...new Set(codes)];
  return new Set(unique.filter((candidate) => !unique.some(
    (other) => other !== candidate && other.startsWith(candidate),
  )));
}

async function loadIncomeAmounts(companyCode: string, year: number, month: number) {
  const config = INCOME_STATEMENT_LINES;
  const items = await prisma.financeVoucherItem.findMany({
    where: { voucher: { companyCode, status: "posted", period: { year, month: { lte: month } } } },
    include: { account: { select: { code: true } } },
  });
  if (items.length === 0) return { amounts: {}, source: "missing" as const };
  const amounts: AmountMap = {};
  const prefixSet = getTenantProfile().finance.countryReportProfiles.find((profile) => profile.companyCodes.includes(companyCode))?.prefixSet ?? "chn";
  for (const line of config) {
    const prefixes = prefixSet === "can" ? line.canPrefixes ?? [] : line.chnPrefixes ?? [];
    if (line.isHeader || line.isTotal || line.isGrandTotal || prefixes.length === 0) continue;
    const matched = items.filter((item) => prefixes.some((prefix) => item.account.code.startsWith(prefix)));
    const leaves = leafCodes(matched.map((item) => item.account.code));
    amounts[line.lineCode] = roundMoney(matched.filter((item) => leaves.has(item.account.code)).reduce(
      (sum, item) => sum + (line.direction === "credit" ? item.credit : item.debit),
      0,
    ));
  }
  const value = (key: string) => amounts[key] ?? 0;
  amounts.operatingProfit = roundMoney(
    value("revenue") - value("cost") - value("tax") - value("sales") - value("admin")
      - value("rd") - value("finance") - value("assetLoss") - value("creditLoss")
      + value("fairValueGain") + value("invest") + value("otherIncome"),
  );
  amounts.totalProfit = roundMoney(amounts.operatingProfit + value("nonRev") - value("nonExp"));
  amounts.netProfit = roundMoney(amounts.totalProfit - value("incomeTax"));
  return { amounts, source: "ledger" as const };
}

type BalanceRow = Awaited<ReturnType<typeof loadBalanceRows>>[number];

async function loadBalanceRows(companyCode: string, year: number, month: number) {
  return prisma.financeAccountBalance.findMany({
    where: { companyCode, period: { year, month } },
    include: { account: true },
  });
}

function closingAmount(row: BalanceRow, side: "debit" | "credit") {
  return side === "debit"
    ? row.closingDebit - row.closingCredit
    : row.closingCredit - row.closingDebit;
}

async function loadBalanceAmounts(companyCode: string, year: number, month: number) {
  const config = BALANCE_SHEET_LINES;
  const allRows = await loadBalanceRows(companyCode, year, month);
  if (allRows.length === 0) return { amounts: {}, source: "missing" as const };
  const parentIds = new Set(allRows.map((row) => row.account.parentId).filter((id): id is number => id !== null));
  const rows = allRows.filter((row) => !parentIds.has(row.accountId));
  const amounts: AmountMap = {};
  for (const line of config) {
    if (line.isHeader || line.isTotal || line.isGrandTotal || !line.prefixes?.length) continue;
    const additions = rows.filter((row) => line.prefixes!.some((prefix) => row.account.code.startsWith(prefix)));
    const deductions = rows.filter((row) => line.subtractPrefixes?.some((prefix) => row.account.code.startsWith(prefix)));
    amounts[line.lineCode] = roundMoney(
      additions.reduce((sum, row) => sum + closingAmount(row, line.side), 0)
        - deductions.reduce((sum, row) => sum + closingAmount(row, line.side), 0),
    );
  }
  const sectionTotal = (section: string, side: "debit" | "credit") => {
    const sectionLines = config.filter((line) => line.section === section && !line.isHeader && !line.isTotal && !line.isGrandTotal);
    return roundMoney(rows.reduce((sum, row) => {
      const add = sectionLines.some((line) => line.prefixes?.some((prefix) => row.account.code.startsWith(prefix)));
      const subtract = sectionLines.some((line) => line.subtractPrefixes?.some((prefix) => row.account.code.startsWith(prefix)));
      return sum + (add ? closingAmount(row, side) : 0) - (subtract ? closingAmount(row, side) : 0);
    }, 0));
  };
  amounts.totalCurrentAssets = sectionTotal("currentAssets", "debit");
  amounts.totalNonCurrentAssets = sectionTotal("nonCurrentAssets", "debit");
  amounts.totalAssets = roundMoney(amounts.totalCurrentAssets + amounts.totalNonCurrentAssets);
  amounts.totalCurrentLiabilities = sectionTotal("currentLiabilities", "credit");
  amounts.totalNonCurrentLiabilities = sectionTotal("nonCurrentLiabilities", "credit");
  amounts.totalLiabilities = roundMoney(amounts.totalCurrentLiabilities + amounts.totalNonCurrentLiabilities);
  amounts.totalEquity = sectionTotal("equity", "credit");
  return { amounts, source: "ledger" as const };
}

async function loadCashFlowAmounts(companyCode: string, year: number, month: number): Promise<AmountMap> {
  const config = await loadCashFlowConfig(companyCode, year);
  const result = await computeCashFlowSystemAmounts(companyCode, year, month, config);
  return Object.fromEntries([...result.amounts].map(([lineCode, amount]) => [lineCode, roundMoney(amount)]));
}

export async function loadCompanyStatementFacts(
  companyCode: string,
  year: number,
  month: number,
): Promise<CompanyStatementFacts> {
  const [income, priorIncome, balance, priorBalance, cashFlow] = await Promise.all([
    loadIncomeAmounts(companyCode, year, month),
    loadIncomeAmounts(companyCode, year - 1, month),
    loadBalanceAmounts(companyCode, year, month),
    loadBalanceAmounts(companyCode, year - 1, month),
    loadCashFlowAmounts(companyCode, year, month),
  ]);
  return {
    income: income.amounts,
    priorIncome: priorIncome.amounts,
    balance: balance.amounts,
    priorBalance: priorBalance.amounts,
    cashFlow,
    incomeSource: income.source,
    balanceSource: balance.source,
    priorIncomeSource: priorIncome.source,
    priorBalanceSource: priorBalance.source,
  };
}

function namedTotals<T>(rows: T[], name: (row: T) => string | null, value: (row: T) => number | null) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = name(row)?.trim();
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + (value(row) ?? 0));
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([key, amount]) => ({ key, amount: roundMoney(amount) }));
}

export async function loadOperationalFacts(year: number, month: number) {
  const [shipments, costs] = await Promise.all([
    prisma.financeShipment.findMany({ where: { year, month: { lte: month } } }),
    prisma.financeCostStructureRow.findMany({ where: { year, month: { lte: month } } }),
  ]);
  const shipmentAmount = roundMoney(shipments.reduce((sum, row) => sum + (row.amount ?? 0), 0));
  const receivedAmount = roundMoney(shipments.reduce((sum, row) => sum + (row.receivedAmount ?? 0), 0));
  const costAmount = roundMoney(costs.reduce((sum, row) => sum + costStructureTotalCost(row), 0));
  const costCategories = [
    { key: "原材料", amount: costs.reduce((sum, row) => sum + (row.rawMaterials ?? 0), 0) },
    { key: "包材", amount: costs.reduce((sum, row) => sum + (row.packagingMaterials ?? 0), 0) },
    { key: "人工", amount: costs.reduce((sum, row) => sum + (row.directLaborWage ?? 0) + (row.directLaborSocialSecurity ?? 0) + (row.directLaborWelfare ?? 0), 0) },
    { key: "辅助人工", amount: costs.reduce((sum, row) => sum + (row.auxiliaryLaborWage ?? 0) + (row.auxiliaryLaborSocialSecurity ?? 0) + (row.auxiliaryLaborWelfare ?? 0), 0) },
    { key: "制造费用", amount: costs.reduce((sum, row) => sum + (row.utilities ?? 0) + (row.depreciationDirect ?? 0) + (row.depreciationAuxiliary ?? 0) + (row.otherManufacturingCost ?? 0), 0) },
  ].map((row) => ({ ...row, amount: roundMoney(row.amount) })).sort((left, right) => right.amount - left.amount);
  return {
    shipmentMonths: [...new Set(shipments.map((row) => row.month).filter((value): value is number => value !== null))].sort((a, b) => a - b),
    costMonths: [...new Set(costs.map((row) => row.month).filter((value): value is number => value !== null))].sort((a, b) => a - b),
    shipmentAmount,
    receivedAmount,
    costAmount,
    topProducts: namedTotals(shipments, (row) => row.productName, (row) => row.amount),
    topCustomers: namedTotals(shipments, (row) => row.customerName, (row) => row.amount),
    costCategories,
    topCostProducts: namedTotals(costs, (row) => row.productName, costStructureTotalCost),
  };
}

function cumulativeBudget(row: Record<string, unknown>, month: number) {
  let total = 0;
  for (let index = 1; index <= month; index += 1) total += Number(row[`month${index}`] ?? 0);
  return total;
}

export async function loadBudgetFacts(companyCodes: string[], year: number, month: number) {
  const companyCode = companyCodes.length === 1 ? companyCodes[0] : null;
  const version = await prisma.financeBudgetVersion.findFirst({
    where: { year, companyCode, status: "active" },
    orderBy: { updatedAt: "desc" },
  });
  if (!version) return null;
  const [deptRows, rdRows] = await Promise.all([
    prisma.financeBudgetDept.findMany({ where: { versionId: version.id } }),
    prisma.financeBudgetRd.findMany({ where: { versionId: version.id } }),
  ]);
  const rows = [
    ...deptRows.map((row) => ({ name: row.accountName, plan: cumulativeBudget(row, month), mapped: row.accountId !== null })),
    ...rdRows.map((row) => ({ name: row.category, plan: cumulativeBudget(row, month), mapped: row.accountId !== null })),
  ];
  const names = [...new Set(rows.map((row) => row.name))];
  const actualItems = await prisma.financeVoucherItem.findMany({
    where: {
      account: { name: { in: names } },
      voucher: { companyCode: { in: companyCodes }, status: "posted", period: { year, month: { lte: month } } },
    },
    include: { account: { select: { name: true } } },
  });
  const actualByName = new Map<string, number>();
  for (const item of actualItems) actualByName.set(item.account.name, (actualByName.get(item.account.name) ?? 0) + item.debit);
  const byName = new Map<string, { plan: number; mapped: boolean }>();
  for (const row of rows) {
    const current = byName.get(row.name) ?? { plan: 0, mapped: false };
    byName.set(row.name, { plan: current.plan + row.plan, mapped: current.mapped || row.mapped });
  }
  return {
    version,
    rows: [...byName.entries()].map(([name, row]) => ({ name, plan: roundMoney(row.plan), actual: roundMoney(actualByName.get(name) ?? 0), mapped: row.mapped })),
    mappedRows: rows.filter((row) => row.mapped).length,
    totalRows: rows.length,
  };
}
