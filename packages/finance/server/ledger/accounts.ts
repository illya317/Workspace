import { matchText } from "@workspace/core/search";
import { prisma, Prisma } from "@workspace/platform/server/prisma";
import { snapshotHistory } from "@workspace/platform/server/history";

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
  const data: Prisma.FinanceAccountUncheckedCreateInput = {
    code: input.code,
    name: input.name,
    category: input.category,
    parentId: optionalInt(input.parentId),
    balanceDirection: optionalString(input.balanceDirection) || "debit",
    companyCode: optionalString(input.companyCode) || "",
    mnemonicCode: optionalString(input.mnemonicCode),
    currency: optionalString(input.currency),
    groupSubjectCode: optionalString(input.groupSubjectCode),
    subjectLevel: optionalInt(input.subjectLevel),
    isActive: input.isActive !== undefined ? Boolean(input.isActive) : true,
    sortOrder: optionalInt(input.sortOrder) || 0,
    editedBy: userId,
  };

  const record = await prisma.financeAccount.create({
    data,
  });
  await snapshotHistory("FinanceAccount", record.id, userId);
  return { success: true, record };
}

export async function updateFinanceAccount(id: number, input: UpdateFinanceAccountInput, userId: number) {
  const updateData: Prisma.FinanceAccountUncheckedUpdateInput = {
    editedBy: userId,
    editedAt: new Date(),
    version: { increment: 1 },
  };

  if (input.code !== undefined) updateData.code = String(input.code);
  if (input.name !== undefined) updateData.name = String(input.name);
  if (input.category !== undefined) updateData.category = String(input.category);
  if (input.balanceDirection !== undefined) updateData.balanceDirection = String(input.balanceDirection);
  if (input.isActive !== undefined) updateData.isActive = Boolean(input.isActive);
  if (input.sortOrder !== undefined) updateData.sortOrder = optionalInt(input.sortOrder) || 0;
  if (input.reclassTargetCode !== undefined) updateData.reclassTargetCode = optionalString(input.reclassTargetCode);
  if (input.companyCode !== undefined) updateData.companyCode = optionalString(input.companyCode) || "";
  if (input.mnemonicCode !== undefined) updateData.mnemonicCode = optionalString(input.mnemonicCode);
  if (input.currency !== undefined) updateData.currency = optionalString(input.currency);
  if (input.groupSubjectCode !== undefined) updateData.groupSubjectCode = optionalString(input.groupSubjectCode);
  if (input.subjectLevel !== undefined) updateData.subjectLevel = optionalInt(input.subjectLevel);

  const account = await prisma.financeAccount.update({
    where: { id },
    data: updateData,
  });
  return { success: true, account };
}

export async function deleteFinanceAccount(id: number, userId: number) {
  await snapshotHistory("FinanceAccount", id, userId);
  await prisma.financeAccount.delete({ where: { id } });
  return { success: true };
}
