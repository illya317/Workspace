import { prisma, Prisma } from "@workspace/platform/server/prisma";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import {
  buildFinanceIdCommand,
  buildFinancePeriodCreateCommand,
  buildFinancePeriodScopeCommand,
  buildFinancePeriodUpdateCommand,
} from "../domain/finance-validation";

export type ListFinancePeriodsInput = {
  year?: number;
};

export type CreateFinancePeriodInput = {
  year: number;
  month: number;
  startDate?: string;
  endDate?: string;
  companyCode?: string;
};

export type UpdateFinancePeriodInput = {
  isClosed?: boolean;
};

export type InitializeFinanceDefaultsInput = {
  year: number;
  month: number;
  companyCode: string;
};

export type LookupFinancePeriodInput = {
  companyCode: string;
  year: number;
  month: number;
};

export type FinanceLedgerDefaultScope = {
  companyCode: string;
  year: number;
  month: number;
};

const FINANCE_LEDGER_DEFAULT_COMPANY_CONFIG_KEY = "finance.ledger.defaultCompanyCode";

const defaultAccounts = [
  { code: "1001", name: "库存现金", category: "asset", balanceDirection: "debit", sortOrder: 1 },
  { code: "1002", name: "银行存款", category: "asset", balanceDirection: "debit", sortOrder: 2 },
  { code: "1122", name: "应收账款", category: "asset", balanceDirection: "debit", sortOrder: 3 },
  { code: "1403", name: "原材料", category: "asset", balanceDirection: "debit", sortOrder: 4 },
  { code: "1405", name: "库存商品", category: "asset", balanceDirection: "debit", sortOrder: 5 },
  { code: "1601", name: "固定资产", category: "asset", balanceDirection: "debit", sortOrder: 6 },
  { code: "1602", name: "累计折旧", category: "asset", balanceDirection: "credit", sortOrder: 7 },
  { code: "2001", name: "短期借款", category: "liability", balanceDirection: "credit", sortOrder: 8 },
  { code: "2202", name: "应付账款", category: "liability", balanceDirection: "credit", sortOrder: 9 },
  { code: "4001", name: "实收资本", category: "equity", balanceDirection: "credit", sortOrder: 10 },
  { code: "4103", name: "本年利润", category: "equity", balanceDirection: "credit", sortOrder: 11 },
  { code: "5001", name: "生产成本", category: "cost", balanceDirection: "debit", sortOrder: 12 },
  { code: "5101", name: "制造费用", category: "cost", balanceDirection: "debit", sortOrder: 13 },
  { code: "6001", name: "主营业务收入", category: "revenue", balanceDirection: "credit", sortOrder: 14 },
  { code: "6401", name: "主营业务成本", category: "revenue", balanceDirection: "debit", sortOrder: 15 },
  { code: "6601", name: "销售费用", category: "revenue", balanceDirection: "debit", sortOrder: 16 },
  { code: "6602", name: "管理费用", category: "revenue", balanceDirection: "debit", sortOrder: 17 },
  { code: "6603", name: "财务费用", category: "revenue", balanceDirection: "debit", sortOrder: 18 },
];

function periodDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function periodEndDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeCompanyCode(companyCode: string | undefined) {
  return companyCode || "";
}

export function financeLedgerScopeFromCutoffDate(
  companyCode: string,
  cutoffDate: string | null,
): FinanceLedgerDefaultScope | null {
  const match = cutoffDate?.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return { companyCode, year, month };
}

export async function getDefaultFinanceLedgerScope(): Promise<FinanceLedgerDefaultScope | null> {
  const config = await prisma.systemConfig.findUnique({
    where: { key: FINANCE_LEDGER_DEFAULT_COMPANY_CONFIG_KEY },
    select: { value: true },
  });
  const companyCode = config?.value.trim();
  if (!companyCode) return null;

  const latestImport = await prisma.financeLedgerImport.findFirst({
    where: { companyCode, status: "completed", cutoffDate: { not: null } },
    orderBy: [{ cutoffDate: "desc" }, { importedAt: "desc" }],
    select: { cutoffDate: true },
  });
  const importedScope = financeLedgerScopeFromCutoffDate(companyCode, latestImport?.cutoffDate ?? null);
  if (importedScope) {
    const importedPeriod = await prisma.financePeriod.findFirst({
      where: importedScope,
      select: { companyCode: true, year: true, month: true },
    });
    if (importedPeriod) return importedPeriod;
  }

  const latestPeriodWithVouchers = await prisma.financePeriod.findFirst({
    where: { companyCode, vouchers: { some: {} } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { companyCode: true, year: true, month: true },
  });
  if (latestPeriodWithVouchers) return latestPeriodWithVouchers;

  return prisma.financePeriod.findFirst({
    where: { companyCode },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { companyCode: true, year: true, month: true },
  });
}

export async function listFinancePeriods(input: ListFinancePeriodsInput) {
  const where: Prisma.FinancePeriodWhereInput = {};
  if (input.year) where.year = input.year;

  const periods = await prisma.financePeriod.findMany({
    where,
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return { periods };
}

export async function createFinancePeriod(input: CreateFinancePeriodInput) {
  const command = buildFinancePeriodCreateCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  const companyCode = normalizeCompanyCode(command.data.input.companyCode);
  const existing = await prisma.financePeriod.findFirst({
    where: { year: command.data.input.year, month: command.data.input.month, companyCode },
  });
  if (existing) return { success: false, error: "该期间已存在", status: 400 as const };

  const period = await prisma.financePeriod.create({
    data: {
      year: command.data.input.year,
      month: command.data.input.month,
      startDate: command.data.input.startDate || periodDate(command.data.input.year, command.data.input.month, "01"),
      endDate: command.data.input.endDate || periodDate(command.data.input.year, command.data.input.month, "31"),
      companyCode,
    },
  });
  return { success: true, period };
}

export async function updateFinancePeriod(id: number, input: UpdateFinancePeriodInput) {
  const command = buildFinancePeriodUpdateCommand(id, input);
  if (!command.ok) throw new Error(command.issue.message);
  const period = await prisma.financePeriod.update({
    where: { id: command.data.id },
    data: { isClosed: command.data.input.isClosed ?? false },
  });
  return { success: true, period };
}

export async function deleteFinancePeriod(id: number, userId: number) {
  const command = buildFinanceIdCommand(id);
  if (!command.ok) throw new Error(command.issue.message);
  const result = await guardedDelete({
    entityType: "FinancePeriod",
    modelKey: "financePeriod",
    id: command.data.id,
    userId,
    actionLabel: "删除会计期间",
    deleteMode: "hard",
    references: [
      { label: "科目余额", count: (tx) => tx.financeAccountBalance.count({ where: { periodId: command.data.id } }) },
      { label: "会计凭证", count: (tx) => tx.financeVoucher.count({ where: { periodId: command.data.id } }) },
      { label: "重分类结果", count: (tx) => tx.reclassResult.count({ where: { periodId: command.data.id } }) },
      { label: "来源余额", count: (tx) => tx.financeSourceAccountBalance.count({ where: { periodId: command.data.id } }) },
      { label: "辅助余额", count: (tx) => tx.financeAuxiliaryBalance.count({ where: { periodId: command.data.id } }) },
      { label: "现金流分配", count: (tx) => tx.financeCashFlowAllocation.count({ where: { periodId: command.data.id } }) },
      { label: "往来项目", count: (tx) => tx.financeOpenItem.count({ where: { periodId: command.data.id } }) },
      { label: "资产期间分录", count: (tx) => tx.financeAssetPeriodEntry.count({ where: { periodId: command.data.id } }) },
      { label: "资产调整", count: (tx) => tx.financeAssetAdjustment.count({ where: { periodId: command.data.id } }) },
    ],
    referencePolicy: "checked",
  });
  return result.ok
    ? { success: true as const }
    : { success: false as const, error: result.error, status: result.status || 400 };
}

export async function lookupFinancePeriodId(input: LookupFinancePeriodInput) {
  const period = await prisma.financePeriod.findFirst({
    where: { companyCode: input.companyCode, year: input.year, month: input.month },
    select: { id: true },
  });

  return { periodId: period?.id ?? null };
}

export async function initializeFinanceDefaults(input: InitializeFinanceDefaultsInput, userId: number) {
  const command = buildFinancePeriodScopeCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  const editor = buildFinanceIdCommand(userId, "userId");
  if (!editor.ok) throw new Error(editor.issue.message);
  let period = await prisma.financePeriod.findFirst({
    where: { companyCode: command.data.companyCode, year: command.data.year, month: command.data.month },
  });
  if (!period) {
    period = await prisma.financePeriod.create({
      data: {
        companyCode: command.data.companyCode,
        year: command.data.year,
        month: command.data.month!,
        startDate: periodDate(command.data.year, command.data.month!, 1),
        endDate: periodDate(command.data.year, command.data.month!, periodEndDay(command.data.year, command.data.month!)),
      },
    });
  }

  const createdAccounts = [];
  for (const account of defaultAccounts) {
    const existing = await prisma.financeAccount.findFirst({
      where: { companyCode: command.data.companyCode, code: account.code },
    });
    if (!existing) {
      const created = await prisma.financeAccount.create({
        data: { ...account, companyCode: command.data.companyCode, editedBy: editor.data.id },
      });
      createdAccounts.push(created);
    }
  }

  return {
    success: true,
    period,
    accountsCreated: createdAccounts.length,
    totalAccounts: defaultAccounts.length,
  };
}
