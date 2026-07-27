import type { FinanceGroupAccountCatalogResponse, FinanceGroupAccountUsage } from "@workspace/finance/types";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";

import { financeGroupAccountCodeConventionIssue } from "../../domain/group-chart-validation";
import { buildGroupAccountUsageById, matchesFinanceGroupAccountUsage } from "../account-usage";
import { compareAccountCodes } from "./mapping-policy";

export interface ListFinanceGroupAccountsInput {
  page?: number;
  pageSize?: number;
  policyVersionId?: number;
  keyword?: string;
  category?: string;
  accountUsage?: FinanceGroupAccountUsage;
  reviewStatus?: "confirmed" | "reviewed" | "pending_review" | "pending_delete";
}

export async function listFinanceGroupAccountOptions(input: { keyword?: string; category?: string }) {
  const currentVersion = await prisma.financeAccountingPolicyVersion.findFirst({
    where: { status: "published", effectiveTo: null },
  });
  if (!currentVersion) throw new Error("缺少当前生效的集团会计政策版本");
  const revisions = await prisma.financeGroupAccountRevision.findMany({
    where: {
      policyVersionId: currentVersion.id,
      isActive: true,
      reviewStatus: { not: "pending_delete" },
      ...(input.category ? { category: input.category } : {}),
    },
    orderBy: { code: "asc" },
  });
  const invalid = revisions.find((revision) => financeGroupAccountCodeConventionIssue(revision));
  if (invalid) throw new Error(`${invalid.code} ${invalid.name}：${financeGroupAccountCodeConventionIssue(invalid)}`);
  return {
    items: revisions.filter((revision) => !input.keyword || matchAnyField({
      code: revision.code,
      name: revision.name,
    }, input.keyword)).slice(0, 8).map((revision) => ({
      id: revision.groupAccountId,
      name: `${revision.code} ${revision.name}`,
    })),
  };
}

export async function listFinanceGroupAccounts(
  input: ListFinanceGroupAccountsInput = {},
): Promise<FinanceGroupAccountCatalogResponse> {
  const versions = await prisma.financeAccountingPolicyVersion.findMany({ orderBy: { versionNo: "asc" } });
  const currentVersion = versions.find((version) => version.status === "published" && version.effectiveTo === null);
  if (!currentVersion) throw new Error("缺少当前生效的集团会计政策版本");
  const selectedVersion = versions.find((version) => version.id === input.policyVersionId) ?? currentVersion;
  const [revisions, mappingCounts, mappingYears, parentRecommendations, reclassRules] = await Promise.all([
    prisma.financeGroupAccountRevision.findMany({
      where: {
        policyVersionId: selectedVersion.id,
        isActive: true,
      },
      include: { groupAccount: true },
    }),
    prisma.financeGroupAccountMapping.findMany({
      where: { policyVersionId: selectedVersion.id, groupAccountId: { not: null } },
      select: {
        groupAccountId: true, localAccountCode: true, localAccountName: true,
        localCategory: true, localBalanceDirection: true, mappingMethod: true,
      },
    }),
    prisma.$queryRaw<Array<{ groupAccountId: number; years: number[] }>>(Prisma.sql`
      SELECT mapping."groupAccountId", ARRAY_AGG(DISTINCT account."year" ORDER BY account."year") AS years
      FROM "FinanceGroupAccountMapping" AS mapping
      JOIN "FinanceGroupAccountRevision" AS revision
        ON revision."policyVersionId" = mapping."policyVersionId"
       AND revision."groupAccountId" = mapping."groupAccountId"
      JOIN "FinanceAccount" AS account
        ON account."companyCode" = mapping."companyCode"
       AND account."code" = mapping."localAccountCode"
       AND account."sourceSystem" IS NOT DISTINCT FROM mapping."sourceSystem"
       AND (
         (mapping."sourceLedger" IS NOT NULL AND account."sourceLedger" = mapping."sourceLedger")
         OR (mapping."sourceLedger" IS NULL AND mapping."sourceDatabase" IS NOT NULL
           AND account."sourceLedger" IS NULL AND account."sourceDatabase" = mapping."sourceDatabase")
         OR (mapping."sourceLedger" IS NULL AND mapping."sourceDatabase" IS NULL
           AND account."sourceLedger" IS NULL AND account."sourceDatabase" IS NULL)
       )
      WHERE mapping."policyVersionId" = ${selectedVersion.id}
        AND mapping."groupAccountId" IS NOT NULL
        AND (
          mapping."mappingMethod" IN ('manual_override', 'hierarchy_match')
          OR (
            mapping."localAccountCode" = revision.code
            AND mapping."localAccountName" = revision.name
            AND mapping."localCategory" = revision.category
            AND mapping."localBalanceDirection" = revision."balanceDirection"
          )
        )
        AND account."year" IS NOT NULL
      GROUP BY mapping."groupAccountId"
    `),
    loadParentRecommendations(selectedVersion.id),
    prisma.financeReclassRule.findMany({
      where: {
        policyVersionId: selectedVersion.id,
        enabled: true,
        source: "manual",
        confirmedBy: { not: null },
        confirmedAt: { not: null },
      },
    }),
  ]);
  const usageByGroupAccountId = buildGroupAccountUsageById(revisions, reclassRules);
  const conventionIssues = revisions.flatMap((revision) => {
    const issue = financeGroupAccountCodeConventionIssue(revision);
    return issue ? [`${revision.code} ${revision.name}：${issue}`] : [];
  });
  if (conventionIssues.length > 0) {
    throw new Error(`集团科目编码检查失败（${conventionIssues.length} 项）：${conventionIssues.slice(0, 10).join("；")}`);
  }
  const revisionByGroup = new Map(revisions.map((revision) => [revision.groupAccountId, revision]));
  const mappingCountByGroup = new Map<number, number>();
  for (const mapping of mappingCounts) {
    if (mapping.groupAccountId === null) continue;
    const revision = revisionByGroup.get(mapping.groupAccountId);
    if (!revision || !isReviewedOrConfirmedMapping(mapping, revision)) continue;
    mappingCountByGroup.set(mapping.groupAccountId, (mappingCountByGroup.get(mapping.groupAccountId) ?? 0) + 1);
  }
  const yearsByGroup = new Map(mappingYears.map((row) => [row.groupAccountId, row.years]));
  const parentRecommendationByGroup = new Map(parentRecommendations.map((row) => [row.groupAccountId, row]));
  const allRows = revisions.map((revision) => {
    const parent = revision.parentGroupAccountId
      ? revisionByGroup.get(revision.parentGroupAccountId)
      : undefined;
    const recommendation = parentRecommendationByGroup.get(revision.groupAccountId);
    return {
      id: revision.groupAccountId,
      code: revision.code,
      name: revision.name,
      category: revision.category,
      balanceDirection: revision.balanceDirection,
      companyCode: null,
      subjectLevel: revision.subjectLevel,
      mnemonicCode: revision.mnemonicCode,
      currency: revision.currency,
      isActive: revision.isActive,
      groupAccount: null,
      sourceKind: revision.groupAccount.sourceKind as FinanceGroupAccountCatalogResponse["rows"][number]["sourceKind"],
      reviewStatus: revision.reviewStatus as FinanceGroupAccountCatalogResponse["rows"][number]["reviewStatus"],
      reviewedBy: revision.reviewedBy,
      reviewedAt: revision.reviewedAt?.toISOString() ?? null,
      consolidationRole: revision.consolidationRole as FinanceGroupAccountCatalogResponse["rows"][number]["consolidationRole"],
      counterpartyRequirement: revision.counterpartyRequirement as FinanceGroupAccountCatalogResponse["rows"][number]["counterpartyRequirement"],
      movementType: revision.movementType as FinanceGroupAccountCatalogResponse["rows"][number]["movementType"],
      translationRateType: revision.translationRateType as FinanceGroupAccountCatalogResponse["rows"][number]["translationRateType"],
      originCompanyCode: revision.groupAccount.originCompanyCode,
      mappingCount: mappingCountByGroup.get(revision.groupAccountId) ?? 0,
      years: yearsByGroup.get(revision.groupAccountId) ?? [],
      updatedAt: revision.updatedAt.toISOString(),
      parent: parent ? { id: parent.groupAccountId, code: parent.code, name: parent.name } : null,
      parentRecommendation: recommendation
        ? recommendation.sourceHasParent
          ? recommendation.suggestedParentGroupAccountId !== null
            ? {
                kind: "mapped" as const,
                localParent: {
                  code: recommendation.localParentCode!,
                  name: recommendation.localParentName!,
                },
                groupAccount: {
                  id: recommendation.suggestedParentGroupAccountId,
                  code: recommendation.suggestedParentCode!,
                  name: recommendation.suggestedParentName!,
                },
              }
            : {
                kind: "unresolved" as const,
                localParent: {
                  code: recommendation.localParentCode!,
                  name: recommendation.localParentName!,
                },
              }
          : { kind: "top_level" as const }
        : null,
    };
  });
  const filtered = allRows.filter((row) => (
    (!input.category || row.category === input.category)
    && matchesFinanceGroupAccountUsage(
      usageByGroupAccountId.get(row.id) ?? { consolidation: false, reclassification: false },
      input.accountUsage,
    )
    && (!input.reviewStatus
      || row.reviewStatus === input.reviewStatus
      || (input.reviewStatus === "pending_review" && row.reviewStatus === "pending_delete"))
    && (!input.keyword || matchAnyField({
      code: row.code,
      name: row.name,
      parentCode: row.parent?.code,
      parentName: row.parent?.name,
      recommendedParentCode: row.parentRecommendation?.kind === "mapped"
        ? row.parentRecommendation.groupAccount.code
        : row.parentRecommendation?.kind === "unresolved"
          ? row.parentRecommendation.localParent.code
          : undefined,
      recommendedParentName: row.parentRecommendation?.kind === "mapped"
        ? row.parentRecommendation.groupAccount.name
        : row.parentRecommendation?.kind === "unresolved"
          ? row.parentRecommendation.localParent.name
          : undefined,
      reviewStatus: row.reviewStatus,
    }, input.keyword))
  )).sort((left, right) => compareAccountCodes(left.code, right.code));

  const total = filtered.length;
  const visibleTreeIds = collectTreeRowIds(filtered, allRows);
  const treeRows = allRows
    .filter((row) => visibleTreeIds.has(row.id))
    .sort((left, right) => compareAccountCodes(left.code, right.code));
  return {
    currentPolicyVersionId: currentVersion.id,
    selectedPolicyVersionId: selectedVersion.id,
    policyVersions: versions.map(versionRow),
    rows: filtered,
    treeRows,
    pagination: { page: 1, pageSize: Math.max(total, 1), total, totalPages: 1 },
  };
}

function isReviewedOrConfirmedMapping(
  mapping: {
    localAccountCode: string;
    localAccountName: string;
    localCategory: string;
    localBalanceDirection: string;
    mappingMethod: string;
  },
  revision: { code: string; name: string; category: string; balanceDirection: string },
) {
  return mapping.mappingMethod === "manual_override"
    || mapping.mappingMethod === "hierarchy_match"
    || (mapping.localAccountCode === revision.code
      && mapping.localAccountName === revision.name
      && mapping.localCategory === revision.category
      && mapping.localBalanceDirection === revision.balanceDirection);
}

type ParentRecommendationRow = {
  groupAccountId: number;
  sourceHasParent: boolean;
  localParentCode: string | null;
  localParentName: string | null;
  suggestedParentGroupAccountId: number | null;
  suggestedParentCode: string | null;
  suggestedParentName: string | null;
};

function loadParentRecommendations(policyVersionId: number) {
  return prisma.$queryRaw<ParentRecommendationRow[]>(Prisma.sql`
    SELECT
      revision."groupAccountId",
      (source_parent."id" IS NOT NULL) AS "sourceHasParent",
      source_parent."code" AS "localParentCode",
      source_parent."name" AS "localParentName",
      parent_revision."groupAccountId" AS "suggestedParentGroupAccountId",
      parent_revision."code" AS "suggestedParentCode",
      parent_revision."name" AS "suggestedParentName"
    FROM "FinanceGroupAccountRevision" AS revision
    JOIN "FinanceGroupAccount" AS group_account
      ON group_account."id" = revision."groupAccountId"
    LEFT JOIN "FinanceGroupAccountMapping" AS origin_mapping
      ON origin_mapping."policyVersionId" = revision."policyVersionId"
     AND origin_mapping."companyCode" = group_account."originCompanyCode"
     AND origin_mapping."sourceScopeKey" = group_account."originSourceScopeKey"
     AND origin_mapping."localAccountCode" = group_account."originLocalAccountCode"
    LEFT JOIN LATERAL (
      SELECT source.*
      FROM "FinanceAccount" AS source
      WHERE source."companyCode" = origin_mapping."companyCode"
        AND source."code" = origin_mapping."localAccountCode"
        AND source."sourceSystem" IS NOT DISTINCT FROM origin_mapping."sourceSystem"
        AND (
          (origin_mapping."sourceLedger" IS NOT NULL AND source."sourceLedger" = origin_mapping."sourceLedger")
          OR (
            origin_mapping."sourceLedger" IS NULL
            AND source."sourceLedger" IS NULL
            AND source."sourceDatabase" IS NOT DISTINCT FROM origin_mapping."sourceDatabase"
          )
        )
      ORDER BY source."year" DESC NULLS LAST, source."id" DESC
      LIMIT 1
    ) AS source_account ON TRUE
    LEFT JOIN "FinanceAccount" AS source_parent ON source_parent."id" = source_account."parentId"
    LEFT JOIN "FinanceGroupAccountMapping" AS parent_mapping
      ON parent_mapping."policyVersionId" = revision."policyVersionId"
     AND parent_mapping."companyCode" = origin_mapping."companyCode"
     AND parent_mapping."sourceScopeKey" = origin_mapping."sourceScopeKey"
     AND parent_mapping."localAccountCode" = source_parent."code"
    LEFT JOIN "FinanceGroupAccountRevision" AS parent_revision
      ON parent_revision."policyVersionId" = revision."policyVersionId"
     AND parent_revision."groupAccountId" = parent_mapping."groupAccountId"
     AND parent_revision."isActive" = TRUE
     AND parent_revision."reviewStatus" <> 'pending_delete'
    WHERE revision."policyVersionId" = ${policyVersionId}
      AND revision."reviewStatus" = 'pending_review'
  `);
}

function collectTreeRowIds(
  matchedRows: FinanceGroupAccountCatalogResponse["rows"],
  allRows: FinanceGroupAccountCatalogResponse["rows"],
) {
  const byId = new Map(allRows.map((row) => [row.id, row]));
  const result = new Set<number>();
  for (const row of matchedRows) {
    let current: FinanceGroupAccountCatalogResponse["rows"][number] | undefined = row;
    const branch = new Set<number>();
    while (current && !branch.has(current.id)) {
      result.add(current.id);
      branch.add(current.id);
      const parentId: number | null = current.parent?.id
        ?? (current.parentRecommendation?.kind === "mapped"
          ? current.parentRecommendation.groupAccount.id
          : null);
      current = parentId === null ? undefined : byId.get(parentId);
    }
  }
  return result;
}

function versionRow(version: {
  id: number;
  versionNo: number;
  code: string;
  name: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: version.id,
    versionNo: version.versionNo,
    code: version.code,
    name: version.name,
    effectiveFrom: version.effectiveFrom?.toISOString().slice(0, 10) ?? null,
    effectiveTo: version.effectiveTo?.toISOString().slice(0, 10) ?? null,
    status: version.status,
    createdAt: version.createdAt.toISOString(),
  };
}
