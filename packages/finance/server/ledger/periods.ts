import { prisma, Prisma } from "@workspace/platform/server/prisma";
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

function periodDate(year: number, month: number, day: string) {
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

function normalizeCompanyCode(companyCode: string | undefined) {
  return companyCode || "";
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

export async function deleteFinancePeriod(id: number) {
  const command = buildFinanceIdCommand(id);
  if (!command.ok) throw new Error(command.issue.message);
  await prisma.financePeriod.delete({ where: { id: command.data.id } });
  return { success: true };
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
        startDate: periodDate(command.data.year, command.data.month!, "01"),
        endDate: periodDate(command.data.year, command.data.month!, "31"),
      },
    });
  }

  const createdAccounts = [];
  for (const account of defaultAccounts) {
    const existing = await prisma.financeAccount.findFirst({ where: { code: account.code } });
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
