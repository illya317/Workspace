/** Versioned group-account reclassification rule candidates. */
import { Prisma, prisma } from "@workspace/platform/server/prisma";

import { financeAccountSourceScopeKey, financeGroupMappingKey } from "../group-accounts/source-accounts";
import type {
  FinanceAccountingPolicyVersionOption,
  RuleCandidate,
  ScanCandidatesResult,
} from "@workspace/finance/types";
import { deriveRuleCandidateDecision } from "./candidate-state";
import {
  normalizeReclassBasis,
  oppositeBalanceSide,
  resolveGroupReclassRule,
  type ResolvableReclassRule,
} from "./resolution";

interface HistoricalAbnormalRow {
  accountId: number;
  companyCode: string;
  code: string;
  sourceSystem: string | null;
  sourceDatabase: string | null;
  sourceLedger: string | null;
  endDate: string;
  netAmount: number;
}

interface GroupAccountMappingRow {
  companyCode: string;
  sourceScopeKey: string;
  localAccountCode: string;
  groupAccountId: number | null;
}

/**
 * 批量判断集团科目是否存在辅助余额事实：
 * 集团科目经 FinanceGroupAccountMapping 映射到的公司科目中存在 FinanceAuxiliaryBalance 行即视为有事实。
 */
export async function loadGroupAccountIdsWithAuxiliaryFacts(
  mappings: readonly GroupAccountMappingRow[],
): Promise<Set<number>> {
  if (mappings.length === 0) return new Set();
  const auxiliaryAccounts = await prisma.financeAuxiliaryBalance.findMany({
    select: {
      accountId: true,
      account: {
        select: {
          companyCode: true,
          code: true,
          sourceSystem: true,
          sourceDatabase: true,
          sourceLedger: true,
        },
      },
    },
    distinct: ["accountId"],
  });
  const factKeys = new Set(auxiliaryAccounts.map(({ account }) => financeGroupMappingKey(
    account.companyCode,
    financeAccountSourceScopeKey(account),
    account.code,
  )));
  return new Set(mappings.flatMap((mapping) => (
    mapping.groupAccountId !== null
    && factKeys.has(financeGroupMappingKey(mapping.companyCode, mapping.sourceScopeKey, mapping.localAccountCode))
      ? [mapping.groupAccountId]
      : []
  )));
}

export async function scanCandidates(policyVersionId?: number): Promise<ScanCandidatesResult> {
  const versions = await prisma.financeAccountingPolicyVersion.findMany({
    where: { status: "published" },
    orderBy: { versionNo: "asc" },
  });
  if (!versions.length) throw new Error("尚未建立会计政策版本");
  const selected = policyVersionId === undefined
    ? [...versions].reverse().find((version) => version.effectiveTo === null) ?? versions.at(-1)!
    : versions.find((version) => version.id === policyVersionId);
  if (!selected) throw new Error("会计政策版本不存在或尚未发布");

  const [revisions, rules, historicalRows, mappings] = await Promise.all([
    prisma.financeGroupAccountRevision.findMany({
      where: { policyVersionId: selected.id, isActive: true, reviewStatus: { not: "pending_delete" } },
      orderBy: { code: "asc" },
    }),
    prisma.financeReclassRule.findMany({
      where: {
        policyVersionId: selected.id,
        enabled: true,
        source: "manual",
        confirmedBy: { not: null },
        confirmedAt: { not: null },
      },
      orderBy: [{ sourceGroupAccountId: "asc" }, { abnormalSide: "asc" }],
    }),
    prisma.$queryRaw<HistoricalAbnormalRow[]>(Prisma.sql`
      SELECT
        account."id" AS "accountId",
        account."companyCode",
        account."code",
        account."sourceSystem",
        account."sourceDatabase",
        account."sourceLedger",
        period."endDate",
        CAST(balance."closingDebit" - balance."closingCredit" AS double precision) AS "netAmount"
      FROM "FinanceAccountBalance" AS balance
      INNER JOIN "FinanceAccount" AS account ON account."id" = balance."accountId"
      INNER JOIN "FinancePeriod" AS period ON period."id" = balance."periodId"
      WHERE ROUND(CAST(balance."closingDebit" - balance."closingCredit" AS numeric), 2) <> 0
    `),
    prisma.financeGroupAccountMapping.findMany({
      where: { policyVersionId: selected.id },
      select: {
        companyCode: true,
        sourceScopeKey: true,
        localAccountCode: true,
        groupAccountId: true,
      },
    }),
  ]);

  const auxiliaryFactGroupIds = await loadGroupAccountIdsWithAuxiliaryFacts(mappings);

  return buildRuleCandidates({
    versions: versions.map(versionOption),
    selectedVersionId: selected.id,
    revisions,
    rules,
    historicalRows,
    mappings,
    auxiliaryFactGroupIds,
  });
}

export function buildRuleCandidates(input: {
  versions: FinanceAccountingPolicyVersionOption[];
  selectedVersionId: number;
  revisions: Array<{
    groupAccountId: number;
    code: string;
    name: string;
    category: string;
    balanceDirection: string;
    parentGroupAccountId: number | null;
  }>;
  rules: ResolvableReclassRule[];
  historicalRows: HistoricalAbnormalRow[];
  mappings: Array<{
    companyCode: string;
    sourceScopeKey: string;
    localAccountCode: string;
    groupAccountId: number | null;
  }>;
  auxiliaryFactGroupIds: ReadonlySet<number>;
}): ScanCandidatesResult {
  const selectedVersion = input.versions.find((version) => version.id === input.selectedVersionId);
  if (!selectedVersion) throw new Error("选中的会计政策版本不存在");
  const balanceSheetRevisions = input.revisions.filter((revision) => isBalanceSheetCategory(revision.category));
  const mappingByLocalKey = new Map(input.mappings.map((mapping) => [
    financeGroupMappingKey(mapping.companyCode, mapping.sourceScopeKey, mapping.localAccountCode),
    mapping.groupAccountId,
  ]));
  const revisionByGroupAccountId = new Map(input.revisions.map((revision) => [revision.groupAccountId, revision]));
  const historicalGroupIds = new Set(input.historicalRows.flatMap((row) => {
    if (!dateFallsInVersion(row.endDate, selectedVersion)) return [];
    const sourceScopeKey = financeAccountSourceScopeKey(row);
    const groupAccountId = mappingByLocalKey.get(financeGroupMappingKey(row.companyCode, sourceScopeKey, row.code));
    if (!groupAccountId) return [];
    const revision = revisionByGroupAccountId.get(groupAccountId);
    if (!revision) return [];
    const abnormal = revision.balanceDirection === "credit" ? row.netAmount > 0 : row.netAmount < 0;
    return abnormal ? [groupAccountId] : [];
  }));
  const parentByGroupAccountId = new Map(input.revisions.map((revision) => [
    revision.groupAccountId,
    revision.parentGroupAccountId,
  ]));
  const candidates = balanceSheetRevisions.map<RuleCandidate>((revision) => {
    const abnormalSide = oppositeBalanceSide(revision.balanceDirection);
    const rule = resolveGroupReclassRule(
      revision.groupAccountId,
      abnormalSide,
      input.rules,
      parentByGroupAccountId,
    );
    const hasHistoricalAbnormalBalance = historicalGroupIds.has(revision.groupAccountId);
    const existingDecision = rule?.decision === "reclassify" || rule?.decision === "no_reclass"
      ? rule.decision
      : null;
    const target = rule?.targetGroupAccountId
      ? revisionByGroupAccountId.get(rule.targetGroupAccountId)
      : undefined;
    const ruleSource = rule
      ? revisionByGroupAccountId.get(rule.sourceGroupAccountId)
      : undefined;
    const hasAuxiliaryFacts = input.auxiliaryFactGroupIds.has(revision.groupAccountId);
    return {
      policyVersionId: input.selectedVersionId,
      groupAccountId: revision.groupAccountId,
      accountCode: revision.code,
      accountName: revision.name,
      balanceDirection: revision.balanceDirection,
      abnormalSide,
      abnormalAmount: 0,
      hasHistoricalAbnormalBalance,
      effectiveDecision: deriveRuleCandidateDecision(existingDecision, hasHistoricalAbnormalBalance),
      existingRuleId: rule?.id ?? null,
      existingRuleSourceGroupAccountId: rule?.sourceGroupAccountId ?? null,
      inheritedFromAccountCode: rule && rule.sourceGroupAccountId !== revision.groupAccountId
        ? ruleSource?.code ?? null
        : null,
      existingTarget: target?.code ?? null,
      existingTargetGroupAccountId: rule?.targetGroupAccountId ?? null,
      existingDecision,
      existingSource: rule ? "manual" : null,
      existingEnabled: rule?.enabled ?? null,
      existingBasis: rule ? normalizeReclassBasis(rule.basis) : null,
      defaultBasis: hasAuxiliaryFacts ? "counterparty_gross" : "account_net",
      hasAuxiliaryFacts,
    };
  }).sort((left, right) => Number(right.hasHistoricalAbnormalBalance) - Number(left.hasHistoricalAbnormalBalance)
    || left.accountCode.localeCompare(right.accountCode, "zh-CN", { numeric: true }));

  return {
    policyVersion: selectedVersion,
    versions: input.versions,
    accountOptions: balanceSheetRevisions.map((revision) => ({
      id: revision.groupAccountId,
      code: revision.code,
      name: revision.name,
    })),
    candidates,
    stats: {
      totalGroupAccounts: balanceSheetRevisions.length,
      historicallyAbnormal: candidates.filter((candidate) => candidate.hasHistoricalAbnormalBalance).length,
      reclassified: candidates.filter((candidate) => candidate.effectiveDecision === "reclassify").length,
      noReclass: candidates.filter((candidate) => candidate.effectiveDecision === "no_reclass").length,
      unconfirmed: candidates.filter((candidate) => candidate.effectiveDecision === null).length,
    },
  };
}

function isBalanceSheetCategory(category: string) {
  return category === "asset" || category === "liability" || category === "equity";
}

function dateFallsInVersion(date: string, version: FinanceAccountingPolicyVersionOption) {
  const day = date.slice(0, 10);
  return (!version.effectiveFrom || day >= version.effectiveFrom.slice(0, 10))
    && (!version.effectiveTo || day < version.effectiveTo.slice(0, 10));
}

function versionOption(
  version: {
    id: number;
    versionNo: number;
    code: string;
    name: string;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    createdAt: Date;
  },
): FinanceAccountingPolicyVersionOption {
  return {
    id: version.id,
    versionNo: version.versionNo,
    code: version.code,
    name: version.name,
    effectiveFrom: version.effectiveFrom?.toISOString().slice(0, 10) ?? null,
    effectiveTo: version.effectiveTo?.toISOString().slice(0, 10) ?? null,
    createdAt: version.createdAt.toISOString(),
    isCurrent: version.effectiveTo === null,
  };
}
