import { prisma } from "@workspace/platform/server/prisma";

import { financeGroupAccountCodeConventionIssue } from "../../packages/finance/server/domain/group-chart-validation";
import { normalizeMappingAccountName } from "../../packages/finance/server/ledger/group-accounts/mapping-policy";

async function main() {
  const [revisions, mappings, rules, adjustments] = await Promise.all([
    prisma.financeGroupAccountRevision.findMany({ include: { groupAccount: true } }),
    prisma.financeGroupAccountMapping.findMany(),
    prisma.financeReclassRule.findMany({ where: { enabled: true } }),
    prisma.financeBalanceReclassAdjustment.findMany({
      select: { sourceGroupAccountId: true, targetGroupAccountId: true },
    }),
  ]);
  const failures: string[] = [];
  const revisionByVersionGroup = new Map(revisions.map((revision) => [
    `${revision.policyVersionId}:${revision.groupAccountId}`,
    revision,
  ]));
  const activeCodeKeys = new Map<string, typeof revisions>();
  const sameNameKeys = new Map<string, typeof revisions>();
  for (const revision of revisions) {
    if (!revision.isActive || revision.reviewStatus === "pending_delete") continue;
    const codeKey = `${revision.policyVersionId}:${revision.code}`;
    const codeRows = activeCodeKeys.get(codeKey) ?? [];
    codeRows.push(revision);
    activeCodeKeys.set(codeKey, codeRows);
    const sameNameKey = [
      revision.policyVersionId,
      revision.category,
      revision.balanceDirection,
      revision.parentGroupAccountId ?? "root",
      normalizeMappingAccountName(revision.name),
    ].join(":");
    const rows = sameNameKeys.get(sameNameKey) ?? [];
    rows.push(revision);
    sameNameKeys.set(sameNameKey, rows);
    const conventionIssue = financeGroupAccountCodeConventionIssue(revision);
    if (conventionIssue) failures.push(`${revision.code} ${revision.name}：${conventionIssue}`);
  }
  for (const [key, rows] of activeCodeKeys) {
    if (rows.length > 1) failures.push(`活动集团科目重复 ${key}：${rows.map((row) => row.code).join("、")}`);
  }
  const sameNameReviewCandidates = [...sameNameKeys.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, accounts: rows.map((row) => `${row.code} ${row.name}`) }));

  const unmapped = mappings.filter((mapping) => mapping.groupAccountId === null);
  if (unmapped.length > 0) failures.push(`仍有 ${unmapped.length} 条公司科目未映射`);
  const mappedToPendingDelete = mappings.filter((mapping) => {
    if (mapping.groupAccountId === null) return false;
    return revisionByVersionGroup.get(`${mapping.policyVersionId}:${mapping.groupAccountId}`)?.reviewStatus === "pending_delete";
  });
  if (mappedToPendingDelete.length > 0) failures.push(`仍有 ${mappedToPendingDelete.length} 条映射指向待删除集团科目`);
  const referencedPendingDelete = revisions.filter((revision) => {
    if (revision.reviewStatus !== "pending_delete") return false;
    if (revision.groupAccount.sourceKind !== "suggested") return true;
    return revisions.some((child) => child.policyVersionId === revision.policyVersionId
        && child.parentGroupAccountId === revision.groupAccountId)
      || rules.some((rule) => rule.sourceGroupAccountId === revision.groupAccountId
        || rule.targetGroupAccountId === revision.groupAccountId)
      || adjustments.some((adjustment) => adjustment.sourceGroupAccountId === revision.groupAccountId
        || adjustment.targetGroupAccountId === revision.groupAccountId);
  });
  if (referencedPendingDelete.length > 0) {
    failures.push(`待删除集团科目中仍有 ${referencedPendingDelete.length} 条不是无引用系统建议项`);
  }

  const reclassGroupIds = new Set(rules.flatMap((rule) => [
    rule.sourceGroupAccountId,
    ...(rule.targetGroupAccountId === null ? [] : [rule.targetGroupAccountId]),
  ]));
  const unreviewedReclassMappings = mappings.filter((mapping) => (
    mapping.groupAccountId !== null
    && reclassGroupIds.has(mapping.groupAccountId)
    && mapping.mappingMethod !== "manual_override"
    && mapping.mappingMethod !== "hierarchy_match"
  ));
  if (unreviewedReclassMappings.length > 0) {
    failures.push(`重分类相关科目仍有 ${unreviewedReclassMappings.length} 条映射未复核`);
  }

  const result = {
    ok: failures.length === 0,
    activeGroupAccounts: revisions.filter((revision) => revision.isActive && revision.reviewStatus !== "pending_delete").length,
    pendingReviewGroupAccounts: revisions.filter((revision) => revision.reviewStatus === "pending_review").length,
    pendingDeleteGroupAccounts: revisions.filter((revision) => revision.reviewStatus === "pending_delete").length,
    mappings: mappings.length,
    pendingReviewMappings: mappings.filter((mapping) => ["exact_name", "suggested", "unmatched"].includes(mapping.mappingMethod)).length,
    confirmedMappings: mappings.filter((mapping) => ["reference_seed", "exact_code_name"].includes(mapping.mappingMethod)).length,
    reviewedMappings: mappings.filter((mapping) => ["manual_override", "hierarchy_match"].includes(mapping.mappingMethod)).length,
    activeReclassRules: rules.length,
    sameNameReviewCandidates,
    failures,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
