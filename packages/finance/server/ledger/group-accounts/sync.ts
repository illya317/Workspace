import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

import {
  buildFinanceGroupChartSyncCommand,
  financeGroupAccountCodeConventionIssue,
} from "../../domain/group-chart-validation";

import { decideGroupAccountMapping } from "./mapping-policy";
import { ensureCurrentFinanceAccountingPolicyVersion } from "./policy-versions";
import {
  financeGroupMappingKey,
  loadLatestGroupSourceAccounts,
  type FinanceGroupSourceAccount,
} from "./source-accounts";

export interface FinanceGroupChartSyncResult {
  groupAccounts: number;
  mappings: number;
  createdGroupAccounts: number;
  createdMappings: number;
  shiftedCodes: number;
}

export interface FinanceGroupChartSyncInput {
  companyCodes?: readonly string[];
}

export function syncFinanceGroupChart(input: FinanceGroupChartSyncInput = {}) {
  const command = buildFinanceGroupChartSyncCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.$transaction((tx) => syncFinanceGroupChartInTransaction(tx, command.data), {
    maxWait: 30_000,
    timeout: 300_000,
  });
}

export async function syncFinanceGroupChartInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceGroupChartSyncInput = {},
): Promise<FinanceGroupChartSyncResult> {
  const command = buildFinanceGroupChartSyncCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  input = command.data;
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext('finance-group-chart-sync')) IS NULL AS acquired
  `);
  const referenceCompanyCode = getTenantProfile().finance.referenceCompanyCode;
  const policyVersion = await ensureCurrentFinanceAccountingPolicyVersion(tx);
  const masterGroups = await tx.financeGroupAccount.findMany({ orderBy: { id: "asc" } });
  await ensurePolicyVersionRevisions(tx, policyVersion.id, masterGroups);
  const revisions = await tx.financeGroupAccountRevision.findMany({
    where: { policyVersionId: policyVersion.id },
    orderBy: { id: "asc" },
  });
  const revisionByGroupId = new Map(revisions.map((revision) => [revision.groupAccountId, revision]));
  const groups = masterGroups.map((group) => {
    const revision = revisionByGroupId.get(group.id);
    return revision ? {
      ...group,
      code: revision.code,
      name: revision.name,
      category: revision.category,
      balanceDirection: revision.balanceDirection,
      parentId: revision.parentGroupAccountId,
    } : group;
  });
  const bootstrapReferenceChart = groups.length === 0;
  let accounts = await loadLatestGroupSourceAccounts(tx, input.companyCodes);
  if (groups.length === 0 && !accounts.some((account) => account.companyCode === referenceCompanyCode)) {
    accounts = await loadLatestGroupSourceAccounts(tx, [referenceCompanyCode, ...(input.companyCodes ?? [])]);
  }
  if (groups.length === 0 && !accounts.some((account) => account.companyCode === referenceCompanyCode)) {
    return { groupAccounts: 0, mappings: 0, createdGroupAccounts: 0, createdMappings: 0, shiftedCodes: 0 };
  }
  const mappings = await tx.financeGroupAccountMapping.findMany({
    where: { policyVersionId: policyVersion.id },
    orderBy: { id: "asc" },
  });
  const accountByKey = new Map(accounts.map((account) => [accountKey(account), account]));
  const mappingByKey = new Map(mappings.map((mapping) => [
    financeGroupMappingKey(mapping.companyCode, mapping.sourceScopeKey, mapping.localAccountCode), mapping,
  ]));
  let createdGroupAccounts = 0;
  let createdMappings = 0;
  const shiftedCodes = 0;

  const createGroup = async (
    account: FinanceGroupSourceAccount,
    code: string,
    sourceKind: "reference_seed" | "suggested" = "reference_seed",
    parentGroupAccountId: number | null = null,
  ) => {
    const conventionIssue = financeGroupAccountCodeConventionIssue({ code, category: account.category });
    if (conventionIssue) throw new Error(`${code} ${account.name}：${conventionIssue}`);
    const parent = parentGroupAccountId === null
      ? null
      : groups.find((candidate) => candidate.id === parentGroupAccountId);
    if (parentGroupAccountId !== null && !parent) throw new Error(`建议集团科目的父级 ${parentGroupAccountId} 不存在`);
    const group = await tx.financeGroupAccount.create({ data: {
      code, name: account.name, category: account.category, balanceDirection: account.balanceDirection,
      mnemonicCode: account.mnemonicCode, currency: account.currency,
      subjectLevel: parent ? (parent.subjectLevel ?? 0) + 1 : 1,
      parentId: parentGroupAccountId,
      sourceKind, reviewStatus: sourceKind === "reference_seed" ? "confirmed" : "pending_review",
      originCompanyCode: account.companyCode, originSourceScopeKey: account.sourceScopeKey,
      originLocalAccountCode: account.code,
    } });
    await tx.financeGroupAccountRevision.create({ data: {
      policyVersionId: policyVersion.id,
      groupAccountId: group.id,
      code,
      name: account.name,
      category: account.category,
      balanceDirection: account.balanceDirection,
      mnemonicCode: account.mnemonicCode,
      currency: account.currency,
      subjectLevel: parent ? (parent.subjectLevel ?? 0) + 1 : 1,
      parentGroupAccountId,
      isActive: true,
      reviewStatus: sourceKind === "reference_seed" ? "confirmed" : "pending_review",
    } });
    groups.push(group);
    createdGroupAccounts += 1;
    return group;
  };

  const createSuggestedGroup = async (account: FinanceGroupSourceAccount) => {
    const parentGroupAccountId = resolveSuggestedParentGroupAccountId(account, groups, mappingByKey);
    const code = allocateSuggestedGroupCode(account, groups, parentGroupAccountId);
    return createGroup(account, code, "suggested", parentGroupAccountId);
  };

  const createMapping = async (
    account: FinanceGroupSourceAccount,
    groupAccountId: number | null,
    mappingMethod: "unmatched" | "reference_seed" | "exact_code_name" | "exact_name" | "suggested",
  ) => {
    const mapping = await tx.financeGroupAccountMapping.create({ data: {
      policyVersionId: policyVersion.id,
      groupAccountId, companyCode: account.companyCode, sourceScopeKey: account.sourceScopeKey,
      sourceSystem: account.sourceSystem, sourceDatabase: account.sourceDatabase, sourceLedger: account.sourceLedger,
      localAccountCode: account.code, localAccountName: account.name, localCategory: account.category,
      localBalanceDirection: account.balanceDirection, latestYear: account.year, mappingMethod,
    } });
    mappingByKey.set(accountKey(account), mapping);
    createdMappings += 1;
  };

  const referenceAccounts = accounts.filter((account) => account.companyCode === referenceCompanyCode);
  for (const account of referenceAccounts) {
    const existingMapping = mappingByKey.get(accountKey(account));
    if (existingMapping?.groupAccountId !== null
      && (existingMapping?.mappingMethod === "manual_override"
        || existingMapping?.mappingMethod === "hierarchy_match"
        || existingMapping?.mappingMethod === "suggested")) {
      await updateMappingSnapshot(
        tx,
        existingMapping,
        account,
        existingMapping.groupAccountId,
        existingMapping.mappingMethod,
      );
      continue;
    }
    const originGroup = groups.find((candidate) => candidate.reviewStatus !== "pending_delete"
      && candidate.originCompanyCode === account.companyCode
      && candidate.originSourceScopeKey === account.sourceScopeKey
      && candidate.originLocalAccountCode === account.code);
    if (existingMapping && originGroup) {
      await updateMappingSnapshot(tx, existingMapping, account, originGroup.id, "reference_seed");
      continue;
    }
    if (existingMapping?.groupAccountId !== null && existingMapping?.mappingMethod === "reference_seed") {
      await updateMappingSnapshot(
        tx,
        existingMapping,
        account,
        existingMapping.groupAccountId,
        existingMapping.mappingMethod,
      );
      continue;
    }
    let group = bootstrapReferenceChart ? groups.find((candidate) => candidate.code === account.code) : undefined;
    if (bootstrapReferenceChart && !group) group = await createGroup(account, account.code);
    const decision = group
      ? { kind: "existing" as const, groupAccountId: group.id, method: "reference_seed" as const }
      : decideGroupAccountMapping(account, groups.filter((candidate) => candidate.reviewStatus !== "pending_delete"));
    const suggestedGroup = decision.kind === "unmatched"
      ? await createSuggestedGroup(account)
      : null;
    const groupAccountId = decision.kind === "existing" ? decision.groupAccountId : suggestedGroup!.id;
    const mappingMethod = decision.kind === "existing" ? decision.method : "suggested";
    if (existingMapping) await updateMappingSnapshot(tx, existingMapping, account, groupAccountId, mappingMethod);
    else await createMapping(account, groupAccountId, mappingMethod);
  }

  for (const account of accounts.filter((candidate) => candidate.companyCode !== referenceCompanyCode)) {
    const existingMapping = mappingByKey.get(accountKey(account));
    if (existingMapping?.groupAccountId !== null
      && (existingMapping?.mappingMethod === "manual_override"
        || existingMapping?.mappingMethod === "hierarchy_match"
        || existingMapping?.mappingMethod === "suggested")) {
      await updateMappingSnapshot(
        tx,
        existingMapping,
        account,
        existingMapping.groupAccountId,
        existingMapping.mappingMethod,
      );
      continue;
    }
    const decision = decideGroupAccountMapping(
      account,
      groups.filter((candidate) => candidate.reviewStatus !== "pending_delete"),
    );
    const suggestedGroup = decision.kind === "unmatched"
      ? await createSuggestedGroup(account)
      : null;
    const groupAccountId = decision.kind === "existing" ? decision.groupAccountId : suggestedGroup!.id;
    const mappingMethod = decision.kind === "existing" ? decision.method : "suggested";
    if (existingMapping) await updateMappingSnapshot(tx, existingMapping, account, groupAccountId, mappingMethod);
    else await createMapping(account, groupAccountId, mappingMethod);
  }

  await updateGroupParents(tx, policyVersion.id, groups, accountByKey, mappingByKey);
  await syncLegacyGroupSubjectCodes(tx, policyVersion.id);
  return {
    groupAccounts: groups.length,
    mappings: mappingByKey.size,
    createdGroupAccounts,
    createdMappings,
    shiftedCodes,
  };
}

function accountKey(account: Pick<FinanceGroupSourceAccount, "companyCode" | "sourceScopeKey" | "code">) {
  return financeGroupMappingKey(account.companyCode, account.sourceScopeKey, account.code);
}

async function ensurePolicyVersionRevisions(
  tx: Prisma.TransactionClient,
  policyVersionId: number,
  groups: Array<{
    id: number;
    code: string;
    name: string;
    category: string;
    balanceDirection: string;
    mnemonicCode: string | null;
    currency: string | null;
    subjectLevel: number | null;
    parentId: number | null;
    isActive: boolean;
    reviewStatus: string;
  }>,
) {
  const existing = await tx.financeGroupAccountRevision.findMany({
    where: { policyVersionId },
    select: { groupAccountId: true },
  });
  const existingIds = new Set(existing.map((revision) => revision.groupAccountId));
  const missing = groups.filter((group) => !existingIds.has(group.id));
  if (!missing.length) return;
  await tx.financeGroupAccountRevision.createMany({ data: missing.map((group) => ({
    policyVersionId,
    groupAccountId: group.id,
    code: group.code,
    name: group.name,
    category: group.category,
    balanceDirection: group.balanceDirection,
    mnemonicCode: group.mnemonicCode,
    currency: group.currency,
    subjectLevel: group.subjectLevel,
    parentGroupAccountId: group.parentId,
    isActive: group.isActive,
    reviewStatus: group.reviewStatus,
  })) });
}

export function allocateSuggestedGroupCode(
  account: Pick<FinanceGroupSourceAccount, "code" | "category" | "parentAccountCode">,
  groups: Array<{ id: number; code: string; category: string; parentId: number | null }>,
  parentGroupAccountId: number | null,
) {
  const expectedPrefix = ({
    asset: "1",
    liability: "2",
    common: "3",
    equity: "4",
    cost: "5",
    revenue: "6",
    expense: "6",
  } as Record<string, string>)[account.category];
  if (!expectedPrefix) throw new Error(`不支持的集团科目类别：${account.category}`);
  const occupied = new Set(groups.map((group) => group.code));
  if (parentGroupAccountId !== null) {
    const parent = groups.find((group) => group.id === parentGroupAccountId);
    if (!parent) throw new Error(`建议集团科目的父级 ${parentGroupAccountId} 不存在`);
    const localSuffix = account.parentAccountCode && account.code.startsWith(account.parentAccountCode)
      ? account.code.slice(account.parentAccountCode.length)
      : "";
    if (/^\d{2}$/.test(localSuffix)) {
      const preferred = `${parent.code}${localSuffix}`;
      if (!occupied.has(preferred)) return preferred;
    }
    const usedOrdinals = groups
      .filter((group) => group.parentId === parentGroupAccountId && group.code.startsWith(parent.code))
      .map((group) => group.code.slice(parent.code.length))
      .filter((suffix) => /^\d{2,4}$/.test(suffix))
      .map(Number);
    const firstOrdinal = Math.max(0, ...usedOrdinals) + 1;
    for (let ordinal = firstOrdinal; ordinal <= 9_999; ordinal += 1) {
      const candidate = `${parent.code}${String(ordinal).padStart(2, "0")}`;
      if (!occupied.has(candidate)) return candidate;
    }
    throw new Error(`集团科目 ${parent.code} 的下级递增编码已用尽`);
  }

  const preferred = account.code.replace(/\D/g, "");
  if (/^\d{4}$/.test(preferred)
    && preferred.startsWith(expectedPrefix)
    && !occupied.has(preferred)) return preferred;
  const rootCodes = groups
    .filter((group) => group.parentId === null
      && group.category === account.category
      && /^\d{4}$/.test(group.code)
      && group.code.startsWith(expectedPrefix))
    .map((group) => Number(group.code));
  const firstCode = /^\d{4}$/.test(preferred) && preferred.startsWith(expectedPrefix)
    ? Number(preferred) + 1
    : Math.max(Number(`${expectedPrefix}000`), ...rootCodes) + 1;
  for (let code = firstCode; code <= Number(`${expectedPrefix}999`); code += 1) {
    const candidate = String(code);
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error(`${account.category} 类一级集团科目的四位编码已用尽`);
}

function resolveSuggestedParentGroupAccountId(
  account: Pick<FinanceGroupSourceAccount, "companyCode" | "sourceScopeKey" | "parentAccountCode" | "category">,
  groups: Array<{ id: number; code: string; category: string; reviewStatus: string }>,
  mappingByKey: Map<string, { groupAccountId: number | null }>,
) {
  if (!account.parentAccountCode) return null;
  const mapped = mappingByKey.get(financeGroupMappingKey(
    account.companyCode,
    account.sourceScopeKey,
    account.parentAccountCode,
  ))?.groupAccountId;
  if (mapped) return mapped;
  const exactCode = groups.filter((group) => group.reviewStatus !== "pending_delete"
    && group.category === account.category
    && group.code === account.parentAccountCode);
  return exactCode.length === 1 ? exactCode[0]!.id : null;
}

async function updateMappingSnapshot(
  tx: Prisma.TransactionClient,
  mapping: {
    id: number;
    sourceSystem: string | null;
    sourceDatabase: string | null;
    sourceLedger: string | null;
    localAccountName: string;
    localCategory: string;
    localBalanceDirection: string;
    latestYear: number | null;
    mappingMethod: string;
    groupAccountId: number | null;
  },
  account: FinanceGroupSourceAccount,
  groupAccountId: number | null,
  mappingMethod: string,
) {
  if (mapping.sourceSystem === account.sourceSystem
    && mapping.sourceDatabase === account.sourceDatabase
    && mapping.sourceLedger === account.sourceLedger
    && mapping.localAccountName === account.name
    && mapping.localCategory === account.category
    && mapping.localBalanceDirection === account.balanceDirection
    && mapping.latestYear === account.year
    && mapping.mappingMethod === mappingMethod
    && mapping.groupAccountId === groupAccountId) return;
  await tx.financeGroupAccountMapping.update({ where: { id: mapping.id }, data: {
    groupAccountId,
    sourceSystem: account.sourceSystem, sourceDatabase: account.sourceDatabase, sourceLedger: account.sourceLedger,
    localAccountName: account.name, localCategory: account.category,
    localBalanceDirection: account.balanceDirection, latestYear: account.year,
    mappingMethod,
  } });
  Object.assign(mapping, {
    sourceSystem: account.sourceSystem,
    sourceDatabase: account.sourceDatabase,
    sourceLedger: account.sourceLedger,
    localAccountName: account.name,
    localCategory: account.category,
    localBalanceDirection: account.balanceDirection,
    latestYear: account.year,
    mappingMethod,
    groupAccountId,
  });
}

async function updateGroupParents(
  tx: Prisma.TransactionClient,
  policyVersionId: number,
  groups: Array<{ id: number; parentId: number | null; originCompanyCode: string | null; originSourceScopeKey: string | null; originLocalAccountCode: string | null }>,
  accountByKey: Map<string, FinanceGroupSourceAccount>,
  mappingByKey: Map<string, { groupAccountId: number | null }>,
) {
  for (const group of groups) {
    if (!group.originCompanyCode || !group.originSourceScopeKey || !group.originLocalAccountCode) continue;
    const origin = accountByKey.get(financeGroupMappingKey(
      group.originCompanyCode, group.originSourceScopeKey, group.originLocalAccountCode,
    ));
    if (!origin) continue;
    const parentId = origin?.parentAccountCode
      ? mappingByKey.get(financeGroupMappingKey(origin.companyCode, origin.sourceScopeKey, origin.parentAccountCode))?.groupAccountId ?? null
      : null;
    const safeParentId = parentId === group.id ? null : parentId;
    if (group.parentId === safeParentId) continue;
    await tx.financeGroupAccount.update({ where: { id: group.id }, data: { parentId: safeParentId } });
    await tx.financeGroupAccountRevision.update({
      where: { policyVersionId_groupAccountId: { policyVersionId, groupAccountId: group.id } },
      data: { parentGroupAccountId: safeParentId },
    });
    group.parentId = safeParentId;
  }
}

async function syncLegacyGroupSubjectCodes(tx: Prisma.TransactionClient, policyVersionId: number) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "FinanceAccount" AS account
    SET "groupSubjectCode" = NULL
    FROM "FinanceGroupAccountMapping" AS mapping
    WHERE account."companyCode" = mapping."companyCode"
      AND mapping."policyVersionId" = ${policyVersionId}
      AND mapping."groupAccountId" IS NULL
      AND account."code" = mapping."localAccountCode"
      AND account."sourceSystem" IS NOT DISTINCT FROM mapping."sourceSystem"
      AND (
        (mapping."sourceLedger" IS NOT NULL AND account."sourceLedger" = mapping."sourceLedger")
        OR (mapping."sourceLedger" IS NULL AND mapping."sourceDatabase" IS NOT NULL
          AND account."sourceLedger" IS NULL AND account."sourceDatabase" = mapping."sourceDatabase")
        OR (mapping."sourceLedger" IS NULL AND mapping."sourceDatabase" IS NULL
          AND account."sourceLedger" IS NULL AND account."sourceDatabase" IS NULL)
      )
      AND account."groupSubjectCode" IS NOT NULL
  `);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "FinanceAccount" AS account
    SET "groupSubjectCode" = group_account."code"
    FROM "FinanceGroupAccountMapping" AS mapping
    JOIN "FinanceGroupAccount" AS group_account ON group_account."id" = mapping."groupAccountId"
    WHERE account."companyCode" = mapping."companyCode"
      AND mapping."policyVersionId" = ${policyVersionId}
      AND account."code" = mapping."localAccountCode"
      AND account."sourceSystem" IS NOT DISTINCT FROM mapping."sourceSystem"
      AND (
        (mapping."sourceLedger" IS NOT NULL AND account."sourceLedger" = mapping."sourceLedger")
        OR (mapping."sourceLedger" IS NULL AND mapping."sourceDatabase" IS NOT NULL
          AND account."sourceLedger" IS NULL AND account."sourceDatabase" = mapping."sourceDatabase")
        OR (mapping."sourceLedger" IS NULL AND mapping."sourceDatabase" IS NULL
          AND account."sourceLedger" IS NULL AND account."sourceDatabase" IS NULL)
      )
      AND account."groupSubjectCode" IS DISTINCT FROM group_account."code"
  `);
}
