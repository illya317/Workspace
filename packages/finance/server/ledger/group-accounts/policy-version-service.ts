import { Prisma, prisma } from "@workspace/platform/server/prisma";

import {
  buildFinanceAccountingPolicyVersionAdvanceCommand,
  buildFinanceGroupChartSyncCommand,
} from "../../domain/group-chart-validation";
import { policyEffectiveDate } from "./policy-version-rules";

export async function resolveFinanceAccountingPolicyVersionAt(effectiveAt: string | Date) {
  return prisma.$transaction((tx) => resolveFinanceAccountingPolicyVersionAtInTransaction(tx, effectiveAt));
}

export async function resolveFinanceAccountingPolicyVersionAtInTransaction(
  tx: Prisma.TransactionClient,
  effectiveAt: string | Date,
) {
  const date = policyEffectiveDate(effectiveAt);
  const versions = await tx.financeAccountingPolicyVersion.findMany({
    where: {
      status: "published",
      AND: [
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: date } }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] },
      ],
    },
    orderBy: { versionNo: "desc" },
  });
  if (versions.length !== 1) throw new Error(`生效日 ${date.toISOString().slice(0, 10)} 必须且只能命中一个会计政策版本`);
  return versions[0];
}

export async function ensureCurrentFinanceAccountingPolicyVersion(tx: Prisma.TransactionClient) {
  const validation = buildFinanceGroupChartSyncCommand({});
  if (!validation.ok) throw new Error(validation.issue.message);
  const current = await tx.financeAccountingPolicyVersion.findFirst({
    where: { status: "published", effectiveTo: null },
    orderBy: { versionNo: "desc" },
  });
  if (current) return current;
  return tx.financeAccountingPolicyVersion.create({ data: {
    versionNo: 1, code: "V1", name: "集团会计政策 V1",
    effectiveFrom: null, effectiveTo: null, status: "published",
  } });
}

export async function advanceFinanceAccountingPolicyVersionInTransaction(
  tx: Prisma.TransactionClient,
  input: { effectiveFrom: string; name?: string; note?: string },
) {
  const command = buildFinanceAccountingPolicyVersionAdvanceCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext('finance-accounting-policy-version')) IS NULL AS acquired
  `);
  const current = await ensureCurrentFinanceAccountingPolicyVersion(tx);
  const effectiveFrom = policyEffectiveDate(command.data.effectiveFrom);
  if (current.effectiveFrom && effectiveFrom <= current.effectiveFrom) {
    throw new Error(`新版本生效日必须晚于 ${current.effectiveFrom.toISOString().slice(0, 10)}`);
  }
  const nextVersionNo = current.versionNo + 1;
  await tx.financeAccountingPolicyVersion.update({
    where: { id: current.id },
    data: { effectiveTo: effectiveFrom },
  });
  const next = await tx.financeAccountingPolicyVersion.create({ data: {
    versionNo: nextVersionNo,
    code: `V${nextVersionNo}`,
    name: command.data.name ?? `集团会计政策 V${nextVersionNo}`,
    effectiveFrom,
    effectiveTo: null,
    status: "published",
    note: command.data.note ?? null,
  } });
  const revisions = await tx.financeGroupAccountRevision.findMany({ where: { policyVersionId: current.id } });
  const mappings = await tx.financeGroupAccountMapping.findMany({ where: { policyVersionId: current.id } });
  const reclassRules = await tx.financeReclassRule.findMany({ where: { policyVersionId: current.id } });
  if (revisions.length) {
    await tx.financeGroupAccountRevision.createMany({ data: revisions.map((revision) => ({
      policyVersionId: next.id,
      groupAccountId: revision.groupAccountId,
      code: revision.code,
      name: revision.name,
      category: revision.category,
      balanceDirection: revision.balanceDirection,
      mnemonicCode: revision.mnemonicCode,
      currencyId: revision.currencyId,
      subjectLevel: revision.subjectLevel,
      parentGroupAccountId: revision.parentGroupAccountId,
      isActive: revision.isActive,
      reviewStatus: revision.reviewStatus,
      consolidationRole: revision.consolidationRole,
      counterpartyRequirement: revision.counterpartyRequirement,
      movementType: revision.movementType,
      translationRateType: revision.translationRateType,
    })) });
  }
  if (mappings.length) {
    await tx.financeGroupAccountMapping.createMany({ data: mappings.map((mapping) => ({
      policyVersionId: next.id,
      groupAccountId: mapping.groupAccountId,
      companyCode: mapping.companyCode,
      sourceScopeKey: mapping.sourceScopeKey,
      sourceSystem: mapping.sourceSystem,
      sourceDatabase: mapping.sourceDatabase,
      sourceLedger: mapping.sourceLedger,
      localAccountCode: mapping.localAccountCode,
      localAccountName: mapping.localAccountName,
      localAccountId: mapping.localAccountId,
      localCategory: mapping.localCategory,
      localBalanceDirection: mapping.localBalanceDirection,
      latestYear: mapping.latestYear,
      mappingMethod: mapping.mappingMethod,
    })) });
  }
  if (reclassRules.length) {
    await tx.financeReclassRule.createMany({ data: reclassRules.map((rule) => ({
      policyVersionId: next.id,
      sourceGroupAccountId: rule.sourceGroupAccountId,
      targetGroupAccountId: rule.targetGroupAccountId,
      sourceAccountCode: rule.sourceAccountCode,
      abnormalSide: rule.abnormalSide,
      decision: rule.decision,
      targetAccountCode: rule.targetAccountCode,
      enabled: rule.enabled,
      source: rule.source,
      confirmedBy: rule.confirmedBy,
      confirmedAt: rule.confirmedAt,
      note: rule.note,
    })) });
  }
  const consolidationRules = await tx.financeConsolidationRule.findMany({
    where: { policyVersionId: current.id },
    include: { selectors: { orderBy: [{ side: "asc" }, { sequence: "asc" }] } },
  });
  for (const rule of consolidationRules) {
    await tx.financeConsolidationRule.create({ data: {
      policyVersionId: next.id,
      ruleCode: rule.ruleCode,
      name: rule.name,
      ruleType: rule.ruleType,
      dataBasis: rule.dataBasis,
      matchMode: rule.matchMode,
      amountMode: rule.amountMode,
      postingSide: rule.postingSide,
      differenceHandling: rule.differenceHandling,
      toleranceAmount: rule.toleranceAmount,
      currencyRateType: rule.currencyRateType,
      enabled: rule.enabled,
      priority: rule.priority,
      sourceKind: rule.sourceKind,
      note: rule.note,
      createdBy: rule.createdBy,
      updatedBy: rule.updatedBy,
      selectors: { create: rule.selectors.map((selector) => ({
        side: selector.side,
        sequence: selector.sequence,
        selectorType: selector.selectorType,
        consolidationRole: selector.consolidationRole,
        groupAccountId: selector.groupAccountId,
        includeChildren: selector.includeChildren,
      })) },
    } });
  }
  return next;
}
