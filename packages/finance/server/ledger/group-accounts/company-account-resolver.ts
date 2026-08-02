import { prisma, type Prisma } from "@workspace/platform/server/prisma";

import { policyEffectiveDate } from "./policy-version-rules";
import { financeAccountSourceScopeKey, financeGroupMappingKey } from "./source-account-keys";

type GroupPolicyAccountClient = Pick<Prisma.TransactionClient,
  "financeAccountingPolicyVersion" | "financeAccount" | "financeGroupAccountMapping" | "financeGroupAccountRevision"
>;

export type FinanceGroupPolicyAccountResolution = {
  sourceAccountId: number;
  groupAccountId: number | null;
  targetAccount: { id: number; code: string; name: string; category: string; companyCode: string; year: number | null; isActive: boolean } | null;
  status: "mapped" | "source_unmapped" | "target_missing" | "target_ambiguous";
};

/**
 * Resolves a group policy's source-company accounts into one target company's
 * local chart. Existing FinanceGroupAccountMapping rows are consumed read-only.
 */
export function resolveFinanceCompanyAccountsFromGroupPolicyAt(input: {
  sourceAccountIds: readonly number[];
  targetCompanyCode: string;
  fiscalYear: number;
  effectiveAt: string | Date;
}) {
  return prisma.$transaction((tx) => resolveFinanceCompanyAccountsFromGroupPolicyAtInTransaction(tx, input));
}

export async function resolveFinanceCompanyAccountsFromGroupPolicyAtInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    sourceAccountIds: readonly number[];
    targetCompanyCode: string;
    fiscalYear: number;
    effectiveAt: string | Date;
  },
) {
  return resolveFinanceCompanyAccountsFromGroupPolicyWithClient(tx, input);
}

export async function resolveFinanceCompanyAccountsFromGroupPolicyWithClient(
  client: GroupPolicyAccountClient | typeof prisma,
  input: {
    sourceAccountIds: readonly number[];
    targetCompanyCode: string;
    fiscalYear: number;
    effectiveAt: string | Date;
  },
) {
  const sourceAccountIds = [...new Set(input.sourceAccountIds)];
  const effectiveAt = policyEffectiveDate(input.effectiveAt);
  const policyVersions = await client.financeAccountingPolicyVersion.findMany({
    where: {
      status: "published",
      AND: [
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: effectiveAt } }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveAt } }] },
      ],
    },
    orderBy: { versionNo: "desc" },
  });
  if (policyVersions.length !== 1) throw new Error(`生效日 ${effectiveAt.toISOString().slice(0, 10)} 必须且只能命中一个会计政策版本`);
  const policyVersion = policyVersions[0]!;
  if (sourceAccountIds.length === 0) return { policyVersionId: policyVersion.id, resolutions: [] };
  const sourceAccounts = await client.financeAccount.findMany({
    where: { id: { in: sourceAccountIds }, isActive: true },
    select: { id: true, code: true, companyCode: true, sourceSystem: true, sourceDatabase: true, sourceLedger: true },
  });
  const sourceMappings = await client.financeGroupAccountMapping.findMany({
    where: {
      policyVersionId: policyVersion.id,
      companyCode: { in: [...new Set(sourceAccounts.map((account) => account.companyCode))] },
      groupAccountId: { not: null },
    },
    select: { companyCode: true, sourceScopeKey: true, localAccountCode: true, groupAccountId: true },
  });
  const sourceMappingByKey = new Map(sourceMappings.map((mapping) => [
    financeGroupMappingKey(mapping.companyCode, mapping.sourceScopeKey, mapping.localAccountCode),
    mapping.groupAccountId,
  ]));
  const sourceGroupByAccountId = new Map(sourceAccounts.map((account) => [
    account.id,
    sourceMappingByKey.get(financeGroupMappingKey(account.companyCode, financeAccountSourceScopeKey(account), account.code)) ?? null,
  ]));
  const groupAccountIds = [...new Set([...sourceGroupByAccountId.values()].filter((id): id is number => id !== null))];
  const [validRevisions, targetMappings, targetAccounts] = await Promise.all([
    client.financeGroupAccountRevision.findMany({
      where: { policyVersionId: policyVersion.id, groupAccountId: { in: groupAccountIds }, isActive: true, reviewStatus: { not: "pending_delete" } },
      select: { groupAccountId: true },
    }),
    client.financeGroupAccountMapping.findMany({
      where: { policyVersionId: policyVersion.id, companyCode: input.targetCompanyCode, groupAccountId: { in: groupAccountIds } },
      select: { sourceScopeKey: true, localAccountCode: true, groupAccountId: true },
    }),
    client.financeAccount.findMany({
      where: { companyCode: input.targetCompanyCode, year: input.fiscalYear, isActive: true },
      select: { id: true, code: true, name: true, category: true, companyCode: true, year: true, isActive: true, sourceSystem: true, sourceDatabase: true, sourceLedger: true },
    }),
  ]);
  const validGroupIds = new Set(validRevisions.map((revision) => revision.groupAccountId));
  const targetAccountByKey = new Map(targetAccounts.map((account) => [
    financeGroupMappingKey(account.companyCode, financeAccountSourceScopeKey(account), account.code),
    account,
  ]));
  const targetCandidatesByGroup = new Map<number, Array<{ id: number; code: string; name: string; category: string; companyCode: string; year: number | null; isActive: boolean }>>();
  for (const mapping of targetMappings) {
    if (mapping.groupAccountId === null || !validGroupIds.has(mapping.groupAccountId)) continue;
    const account = targetAccountByKey.get(financeGroupMappingKey(input.targetCompanyCode, mapping.sourceScopeKey, mapping.localAccountCode));
    if (!account) continue;
    const candidates = targetCandidatesByGroup.get(mapping.groupAccountId) ?? [];
    candidates.push({ id: account.id, code: account.code, name: account.name, category: account.category, companyCode: account.companyCode, year: account.year, isActive: account.isActive });
    targetCandidatesByGroup.set(mapping.groupAccountId, candidates);
  }
  const resolutions = sourceAccountIds.map<FinanceGroupPolicyAccountResolution>((sourceAccountId) => {
    const groupAccountId = sourceGroupByAccountId.get(sourceAccountId) ?? null;
    if (groupAccountId === null || !validGroupIds.has(groupAccountId)) {
      return { sourceAccountId, groupAccountId, targetAccount: null, status: "source_unmapped" };
    }
    const candidates = uniqueAccounts(targetCandidatesByGroup.get(groupAccountId) ?? []);
    if (candidates.length === 0) return { sourceAccountId, groupAccountId, targetAccount: null, status: "target_missing" };
    if (candidates.length > 1) return { sourceAccountId, groupAccountId, targetAccount: null, status: "target_ambiguous" };
    return { sourceAccountId, groupAccountId, targetAccount: candidates[0]!, status: "mapped" };
  });
  return { policyVersionId: policyVersion.id, resolutions };
}

function uniqueAccounts(accounts: Array<{ id: number; code: string; name: string; category: string; companyCode: string; year: number | null; isActive: boolean }>) {
  return [...new Map(accounts.map((account) => [account.id, account])).values()];
}
