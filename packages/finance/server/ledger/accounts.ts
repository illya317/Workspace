import { matchText } from "@workspace/core/search";
import { prisma, Prisma } from "@workspace/platform/server/prisma";
import { snapshotHistory } from "@workspace/platform/server/history";
import {
  buildFinanceAccountCreateCommand,
  buildFinanceAccountUpdateCommand,
  buildFinanceIdCommand,
} from "../domain/finance-validation";

export type FinanceAccountScope = "mapped" | "unmapped" | "inactive" | "all";

export type ListFinanceAccountsInput = {
  companyCode?: string;
  subjectLevel?: string;
  scope?: FinanceAccountScope;
  year?: string;
  keyword?: string;
  page: number;
  pageSize: number;
};

export type CreateFinanceAccountInput = {
  code: string;
  name: string;
  category: string;
  parentId?: unknown;
  balanceDirection?: unknown;
  companyCode?: unknown;
  mnemonicCode?: unknown;
  currency?: unknown;
  groupSubjectCode?: unknown;
  subjectLevel?: unknown;
  isActive?: unknown;
  sortOrder?: unknown;
};

export type UpdateFinanceAccountInput = {
  code?: unknown;
  name?: unknown;
  category?: unknown;
  balanceDirection?: unknown;
  isActive?: unknown;
  sortOrder?: unknown;
  reclassTargetCode?: unknown;
  companyCode?: unknown;
  mnemonicCode?: unknown;
  currency?: unknown;
  groupSubjectCode?: unknown;
  subjectLevel?: unknown;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed;
}

function parseYear(value: string | undefined) {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 2020 || parsed > 2099 ? null : parsed;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalInt(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function listFinanceAccounts(input: ListFinanceAccountsInput) {
  const where: Prisma.FinanceAccountWhereInput = {};
  const scope = input.scope || "mapped";

  if (scope === "mapped") {
    where.groupSubjectCode = { not: null };
  } else if (scope === "unmapped") {
    where.groupSubjectCode = null;
  } else if (scope === "inactive") {
    where.isActive = false;
  }
  if (input.companyCode) {
    where.companyCode = input.companyCode;
  }

  const subjectLevel = parsePositiveInt(input.subjectLevel, 0);
  if (subjectLevel > 0) where.subjectLevel = subjectLevel;

  const year = parseYear(input.year);
  if (year !== null) where.year = year;

  const page = input.page;
  const pageSize = input.pageSize;
  const keyword = input.keyword || "";

  if (keyword) {
    const all = await prisma.financeAccount.findMany({
      where,
      orderBy: [{ code: "asc" }],
      include: {
        parent: { select: { code: true, name: true } },
      },
    });
    const filtered = all.filter(
      (account) => matchText(account.code, keyword) || matchText(account.name, keyword),
    );
    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize);
    const skip = (page - 1) * pageSize;
    const accounts = filtered.slice(skip, skip + pageSize);
    return {
      data: accounts,
      total,
      page,
      pageSize,
      totalPages,
      accounts,
    };
  }

  const skip = (page - 1) * pageSize;
  const [accounts, total] = await Promise.all([
    prisma.financeAccount.findMany({
      where,
      orderBy: [{ code: "asc" }],
      skip,
      take: pageSize,
      include: {
        parent: { select: { code: true, name: true } },
      },
    }),
    prisma.financeAccount.count({ where }),
  ]);
  const totalPages = Math.ceil(total / pageSize);
  return {
    data: accounts,
    total,
    page,
    pageSize,
    totalPages,
    accounts,
  };
}

export async function createFinanceAccount(input: CreateFinanceAccountInput, userId: number) {
  const command = buildFinanceAccountCreateCommand(input, userId);
  if (!command.ok) throw new Error(command.issue.message);
  const data: Prisma.FinanceAccountUncheckedCreateInput = {
    code: command.data.input.code,
    name: command.data.input.name,
    category: command.data.input.category,
    parentId: optionalInt(command.data.input.parentId),
    balanceDirection: optionalString(command.data.input.balanceDirection) || "debit",
    companyCode: optionalString(command.data.input.companyCode) || "",
    mnemonicCode: optionalString(command.data.input.mnemonicCode),
    currency: optionalString(command.data.input.currency),
    groupSubjectCode: optionalString(command.data.input.groupSubjectCode),
    subjectLevel: optionalInt(command.data.input.subjectLevel),
    isActive: command.data.input.isActive !== undefined ? Boolean(command.data.input.isActive) : true,
    sortOrder: optionalInt(command.data.input.sortOrder) || 0,
    editedBy: command.data.userId,
  };

  const record = await prisma.financeAccount.create({
    data,
  });
  await snapshotHistory("FinanceAccount", record.id, command.data.userId);
  return { success: true, record };
}

export async function updateFinanceAccount(id: number, input: UpdateFinanceAccountInput, userId: number) {
  const command = buildFinanceAccountUpdateCommand(id, input, userId);
  if (!command.ok) throw new Error(command.issue.message);
  const updateData: Prisma.FinanceAccountUncheckedUpdateInput = {
    editedBy: command.data.userId,
    editedAt: new Date(),
    version: { increment: 1 },
  };

  if (command.data.input.code !== undefined) updateData.code = String(command.data.input.code);
  if (command.data.input.name !== undefined) updateData.name = String(command.data.input.name);
  if (command.data.input.category !== undefined) updateData.category = String(command.data.input.category);
  if (command.data.input.balanceDirection !== undefined) updateData.balanceDirection = String(command.data.input.balanceDirection);
  if (command.data.input.isActive !== undefined) updateData.isActive = Boolean(command.data.input.isActive);
  if (command.data.input.sortOrder !== undefined) updateData.sortOrder = optionalInt(command.data.input.sortOrder) || 0;
  if (command.data.input.reclassTargetCode !== undefined) updateData.reclassTargetCode = optionalString(command.data.input.reclassTargetCode);
  if (command.data.input.companyCode !== undefined) updateData.companyCode = optionalString(command.data.input.companyCode) || "";
  if (command.data.input.mnemonicCode !== undefined) updateData.mnemonicCode = optionalString(command.data.input.mnemonicCode);
  if (command.data.input.currency !== undefined) updateData.currency = optionalString(command.data.input.currency);
  if (command.data.input.groupSubjectCode !== undefined) updateData.groupSubjectCode = optionalString(command.data.input.groupSubjectCode);
  if (command.data.input.subjectLevel !== undefined) updateData.subjectLevel = optionalInt(command.data.input.subjectLevel);

  const account = await prisma.financeAccount.update({
    where: { id: command.data.id },
    data: updateData,
  });
  return { success: true, account };
}

export async function deleteFinanceAccount(id: number, userId: number) {
  const command = buildFinanceIdCommand(id);
  if (!command.ok) throw new Error(command.issue.message);
  await snapshotHistory("FinanceAccount", command.data.id, userId);
  await prisma.financeAccount.delete({ where: { id: command.data.id } });
  return { success: true };
}
