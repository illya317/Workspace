import { prisma, type Prisma } from "@workspace/platform/server/prisma";

import { resolveFinanceAccountingPolicyVersionAtInTransaction } from "./policy-versions";
import {
  financeAccountSourceScopeKey,
  financeGroupMappingKey,
  financeGroupScopedLocalKey,
} from "./source-accounts";

export interface ResolvedFinanceGroupAccount {
  id: number;
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  parentId: number | null;
}

export interface FinanceAccountingPolicyVersionSelector {
  id: number;
  versionNo: number;
  code: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

export interface ResolvedFinanceGroupAccountMapping {
  accountId: number;
  companyCode: string;
  localAccountCode: string;
  sourceScopeKey: string;
  groupAccount: ResolvedFinanceGroupAccount;
}

export async function loadFinanceGroupAccountMapByAccountIdsAt(
  accountIds: readonly number[],
  effectiveAt: string | Date,
) {
  return prisma.$transaction((tx) => loadFinanceGroupAccountMapByAccountIdsAtInTransaction(
    tx,
    accountIds,
    effectiveAt,
  ));
}

export async function loadFinanceGroupAccountMapByAccountIdsAtInTransaction(
  tx: Prisma.TransactionClient,
  accountIds: readonly number[],
  effectiveAt: string | Date,
) {
  return loadByAccountIdsAt(tx, accountIds, effectiveAt);
}

export async function loadFinanceGroupAccountMapForPeriod(periodId: number) {
  return prisma.$transaction((tx) => loadFinanceGroupAccountMapForPeriodInTransaction(tx, periodId));
}

export async function loadFinanceGroupAccountMapForPeriodInTransaction(
  tx: Prisma.TransactionClient,
  periodId: number,
) {
  const period = await tx.financePeriod.findUnique({
    where: { id: periodId },
    select: { companyCode: true, year: true, endDate: true },
  });
  if (!period) throw new Error(`会计期间 ${periodId} 不存在`);
  const accounts = await tx.financeAccount.findMany({
    where: { companyCode: period.companyCode, year: period.year, isActive: true },
    select: { id: true },
  });
  return loadFinanceGroupAccountMapByAccountIdsAtInTransaction(
    tx,
    accounts.map((account) => account.id),
    period.endDate,
  );
}

export async function loadFinanceGroupAccountMapByScopedCodeAt(
  companyCode: string,
  effectiveAt: string | Date,
) {
  return prisma.$transaction(async (tx) => {
    const policyVersion = await resolveFinanceAccountingPolicyVersionAtInTransaction(tx, effectiveAt);
    const mappings = await tx.financeGroupAccountMapping.findMany({
      where: { policyVersionId: policyVersion.id, companyCode },
      select: { sourceScopeKey: true, localAccountCode: true, groupAccountId: true },
    });
    const groupAccounts = await loadVersionGroupAccounts(
      tx,
      policyVersion.id,
      mappings.flatMap((mapping) => mapping.groupAccountId === null ? [] : [mapping.groupAccountId]),
    );
    return {
      policyVersion: versionSelector(policyVersion),
      mappings: new Map(mappings.flatMap((mapping) => {
        const groupAccount = mapping.groupAccountId === null ? undefined : groupAccounts.get(mapping.groupAccountId);
        return groupAccount
          ? [[financeGroupScopedLocalKey(mapping.sourceScopeKey, mapping.localAccountCode), groupAccount] as const]
          : [];
      })),
    };
  });
}

async function loadByAccountIdsAt(
  tx: Prisma.TransactionClient,
  accountIds: readonly number[],
  effectiveAt: string | Date,
) {
  const policyVersion = await resolveFinanceAccountingPolicyVersionAtInTransaction(tx, effectiveAt);
  if (!accountIds.length) {
    return { policyVersion: versionSelector(policyVersion), mappings: new Map<number, ResolvedFinanceGroupAccount>() };
  }
  const accounts = await tx.financeAccount.findMany({
    where: { id: { in: [...accountIds] }, isActive: true },
    select: {
      id: true, code: true, companyCode: true,
      sourceSystem: true, sourceDatabase: true, sourceLedger: true,
    },
  });
  const companyCodes = [...new Set(accounts.map((account) => account.companyCode))];
  const mappingRows = await tx.financeGroupAccountMapping.findMany({
    where: { policyVersionId: policyVersion.id, companyCode: { in: companyCodes } },
    select: {
      companyCode: true, sourceScopeKey: true, localAccountCode: true, groupAccountId: true,
    },
  });
  const mappingByLocalKey = new Map(mappingRows.map((mapping) => [
    financeGroupMappingKey(mapping.companyCode, mapping.sourceScopeKey, mapping.localAccountCode),
    mapping.groupAccountId,
  ]));
  const groupAccounts = await loadVersionGroupAccounts(
    tx,
    policyVersion.id,
    [...new Set(mappingRows.flatMap((mapping) => mapping.groupAccountId === null ? [] : [mapping.groupAccountId]))],
  );
  return {
    policyVersion: versionSelector(policyVersion),
    mappings: new Map<number, ResolvedFinanceGroupAccount>(accounts.flatMap((account) => {
      const sourceScopeKey = financeAccountSourceScopeKey(account);
      const groupAccountId = mappingByLocalKey.get(financeGroupMappingKey(account.companyCode, sourceScopeKey, account.code));
      const groupAccount = groupAccountId ? groupAccounts.get(groupAccountId) : undefined;
      return groupAccount ? [[account.id, groupAccount]] : [];
    })),
  };
}

async function loadVersionGroupAccounts(
  tx: Prisma.TransactionClient,
  policyVersionId: number,
  groupAccountIds: readonly number[],
) {
  if (!groupAccountIds.length) return new Map<number, ResolvedFinanceGroupAccount>();
  const revisions = await tx.financeGroupAccountRevision.findMany({
    where: {
      policyVersionId,
      groupAccountId: { in: [...new Set(groupAccountIds)] },
      isActive: true,
      reviewStatus: { not: "pending_delete" },
    },
  });
  return new Map<number, ResolvedFinanceGroupAccount>(revisions.map((revision) => [revision.groupAccountId, {
    id: revision.groupAccountId,
    code: revision.code,
    name: revision.name,
    category: revision.category,
    balanceDirection: revision.balanceDirection,
    parentId: revision.parentGroupAccountId,
  }]));
}

function versionSelector(version: FinanceAccountingPolicyVersionSelector): FinanceAccountingPolicyVersionSelector {
  return {
    id: version.id,
    versionNo: version.versionNo,
    code: version.code,
    effectiveFrom: version.effectiveFrom,
    effectiveTo: version.effectiveTo,
  };
}
