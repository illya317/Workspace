import { matchText } from "@workspace/core/search";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { prisma, Prisma } from "@workspace/platform/server/prisma";
import { snapshotHistory } from "@workspace/platform/server/history";
import {
  buildFinanceAccountCreateCommand,
  buildFinanceAccountUpdateCommand,
  buildFinanceIdCommand,
  validYear,
} from "../domain/finance-validation";
import { diagnoseGroupAccountMapping, type GroupMappingReviewCandidate } from "./group-accounts/mapping-review";
import { resolveFinanceAccountingPolicyVersionAt } from "./group-accounts/policy-versions";
import { financeAccountSourceScopeKey, financeGroupMappingKey } from "./group-accounts/source-accounts";
import type { FinanceGroupAccountReviewStatus } from "../../types/group-account";

export type FinanceAccountScope = "mapped" | "unmapped" | "inactive" | "all";

export type ListFinanceAccountsInput = {
  companyCode?: string;
  subjectLevel?: string;
  scope?: FinanceAccountScope;
  year?: string;
  keyword?: string;
  reviewStatus?: FinanceGroupAccountReviewStatus;
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
  const parsed = validYear(value);
  return parsed.ok ? parsed.data : null;
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
  const scope = input.scope || "all";

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

  if (keyword || input.reviewStatus) {
    const all = await prisma.financeAccount.findMany({
      where,
      orderBy: [{ code: "asc" }],
      include: {
        parent: { select: { code: true, name: true } },
      },
    });
    const attached = await attachGroupAccounts(all, year);
    const filtered = attached.accounts.filter((account) => !keyword
      || matchText(account.code, keyword)
      || matchText(account.name, keyword))
      .filter((account) => !input.reviewStatus || account.reviewStatus === input.reviewStatus);
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
      groupAccountOptions: compatibleOptionsForAccounts(attached.groupAccountOptions, accounts),
    };
  }

  const skip = (page - 1) * pageSize;
  const [accountRows, total] = await Promise.all([
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
  const attached = await attachGroupAccounts(accountRows, year);
  const accounts = attached.accounts;
  const totalPages = Math.ceil(total / pageSize);
  return {
    data: accounts,
    total,
    page,
    pageSize,
    totalPages,
    accounts,
    groupAccountOptions: attached.groupAccountOptions,
  };
}

async function attachGroupAccounts<T extends {
  id: number;
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  companyCode: string;
  isActive: boolean;
  sourceSystem: string | null;
  sourceDatabase: string | null;
  sourceLedger: string | null;
}>(accounts: T[], year: number | null) {
  const effectiveAt = year === null ? new Date() : new Date(`${year}-12-31T00:00:00.000Z`);
  const policyVersion = await resolveFinanceAccountingPolicyVersionAt(effectiveAt);
  const [mappings, revisions] = await Promise.all([
    prisma.financeGroupAccountMapping.findMany({
      where: {
        policyVersionId: policyVersion.id,
        companyCode: { in: [...new Set(accounts.map((account) => account.companyCode))] },
        localAccountCode: { in: [...new Set(accounts.map((account) => account.code))] },
      },
    }),
    prisma.financeGroupAccountRevision.findMany({
      where: { policyVersionId: policyVersion.id, isActive: true },
      include: { groupAccount: { select: { sourceKind: true } } },
    }),
  ]);
  const revisionByGroup = new Map(revisions.map((revision) => [revision.groupAccountId, revision]));
  const mappingByLocalKey = new Map(mappings.map((mapping) => [
    financeGroupMappingKey(mapping.companyCode, mapping.sourceScopeKey, mapping.localAccountCode),
    mapping,
  ]));
  const candidatesByAttributes = new Map<string, GroupMappingReviewCandidate[]>();
  for (const revision of revisions) {
    if (revision.reviewStatus === "pending_delete") continue;
    const key = accountAttributeKey(revision.category, revision.balanceDirection);
    const values = candidatesByAttributes.get(key) ?? [];
    values.push({
      id: revision.groupAccountId,
      code: revision.code,
      name: revision.name,
      category: revision.category,
      balanceDirection: revision.balanceDirection,
      sourceKind: revision.groupAccount.sourceKind as GroupMappingReviewCandidate["sourceKind"],
    });
    candidatesByAttributes.set(key, values);
  }
  const rows = accounts.map((account) => {
    const sourceScopeKey = financeAccountSourceScopeKey(account);
    const mapping = mappingByLocalKey.get(financeGroupMappingKey(account.companyCode, sourceScopeKey, account.code));
    const revision = mapping?.groupAccountId ? revisionByGroup.get(mapping.groupAccountId) : undefined;
    const currentGroupAccount = revision && revision.reviewStatus !== "pending_delete" ? {
      id: revision.groupAccountId,
      code: revision.code,
      name: revision.name,
      category: revision.category,
      balanceDirection: revision.balanceDirection,
      sourceKind: revision.groupAccount.sourceKind as GroupMappingReviewCandidate["sourceKind"],
    } : null;
    const review = diagnoseGroupAccountMapping({
      localAccountCode: account.code,
      localAccountName: account.name,
      localCategory: account.category,
      localBalanceDirection: account.balanceDirection,
      mappingMethod: mapping?.mappingMethod ?? "unmatched",
      currentGroupAccount,
      candidates: candidatesByAttributes.get(accountAttributeKey(account.category, account.balanceDirection)) ?? [],
    });
    return {
      ...account,
      groupAccount: currentGroupAccount ? {
        id: currentGroupAccount.id,
        code: currentGroupAccount.code,
        name: currentGroupAccount.name,
      } : null,
      mapping: mapping ? {
        id: mapping.id,
        updatedAt: mapping.updatedAt.toISOString(),
        method: mapping.mappingMethod,
      } : null,
      reviewStatus: account.isActive ? review.reviewClass : "pending_delete" as const,
    };
  });
  const pageAttributeKeys = new Set(accounts.map((account) => accountAttributeKey(
    account.category,
    account.balanceDirection,
  )));
  return {
    accounts: rows,
    groupAccountOptions: revisions
      .filter((revision) => revision.reviewStatus !== "pending_delete"
        && pageAttributeKeys.has(accountAttributeKey(revision.category, revision.balanceDirection)))
      .sort((left, right) => left.code.localeCompare(right.code, "zh-CN", { numeric: true }))
      .map((revision) => ({
        policyVersionId: revision.policyVersionId,
        id: revision.groupAccountId,
        code: revision.code,
        name: revision.name,
        category: revision.category,
        balanceDirection: revision.balanceDirection,
      })),
  };
}

function accountAttributeKey(category: string, balanceDirection: string) {
  return `${category}:${balanceDirection}`;
}

function compatibleOptionsForAccounts<
  TOption extends { category: string; balanceDirection: string },
  TAccount extends { category: string; balanceDirection: string },
>(
  options: TOption[],
  accounts: TAccount[],
) {
  const keys = new Set(accounts.map((account) => accountAttributeKey(account.category, account.balanceDirection)));
  return options.filter((option) => keys.has(accountAttributeKey(option.category, option.balanceDirection)));
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
  const result = await guardedDelete({
    entityType: "FinanceAccount",
    modelKey: "financeAccount",
    id: command.data.id,
    userId,
    actionLabel: "删除财务科目",
    deleteMode: "hard",
    references: [
      { label: "下级科目", count: (tx) => tx.financeAccount.count({ where: { parentId: command.data.id } }) },
      { label: "科目余额", count: (tx) => tx.financeAccountBalance.count({ where: { accountId: command.data.id } }) },
      { label: "凭证明细", count: (tx) => tx.financeVoucherItem.count({ where: { accountId: command.data.id } }) },
      { label: "余额快照", count: (tx) => tx.financeBalanceSnapshotRow.count({ where: { accountId: command.data.id } }) },
      { label: "来源余额", count: (tx) => tx.financeSourceAccountBalance.count({ where: { accountId: command.data.id } }) },
      { label: "辅助余额", count: (tx) => tx.financeAuxiliaryBalance.count({ where: { accountId: command.data.id } }) },
      { label: "往来项目", count: (tx) => tx.financeOpenItem.count({ where: { accountId: command.data.id } }) },
      { label: "银行账户", count: (tx) => tx.financeBankAccount.count({ where: { accountId: command.data.id } }) },
      { label: "部门预算", count: (tx) => tx.financeBudgetDept.count({ where: { accountId: command.data.id } }) },
      { label: "研发预算", count: (tx) => tx.financeBudgetRd.count({ where: { accountId: command.data.id } }) },
    ],
    referencePolicy: "checked",
  });
  return result.ok
    ? { success: true as const }
    : { success: false as const, error: result.error, status: result.status || 400 };
}
