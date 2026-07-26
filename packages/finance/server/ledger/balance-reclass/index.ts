import { prisma } from "@workspace/platform/server/prisma";

import { buildBalanceComputeCommand, buildReclassRuleScopeCommand } from "../../domain/finance-validation";
import { resolveFinanceAccountingPolicyVersionAtInTransaction } from "../group-accounts/policy-versions";
import { materializeConfirmedReclassAdjustments } from "../reclass-rules/materialize-confirmed";
import { materializeAutomaticRuleAdjustments } from "./automatic";

export { saveBalanceReclassAdjustmentChangeSet } from "./adjustments";
export { materializeAutomaticRuleAdjustments } from "./automatic";

export async function syncBalanceReclassForPeriod(periodId: number) {
  const command = buildBalanceComputeCommand(periodId);
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.$transaction((tx) => materializeAutomaticRuleAdjustments(tx, {
    periodIds: [command.data.id],
  }), { maxWait: 10_000, timeout: 60_000 });
}

export async function syncBalanceReclassForYear(companyCode: string, year: number) {
  const command = buildReclassRuleScopeCommand(companyCode, year);
  if (!command.ok) throw new Error(command.issue.message);
  const [periods, rules] = await Promise.all([
    prisma.financePeriod.findMany({
      where: { companyCode: command.data.companyCode, year: command.data.year },
      select: { id: true, endDate: true },
    }),
    prisma.financeReclassRule.findMany({
      where: { enabled: true, source: "manual", confirmedBy: { not: null }, confirmedAt: { not: null } },
      select: { policyVersionId: true, sourceGroupAccountId: true },
    }),
  ]);
  if (periods.length === 0 || rules.length === 0) {
    return { periods: periods.length, written: 0, updated: 0, deleted: 0, skippedProtected: 0 };
  }
  const result = await prisma.$transaction(async (tx) => {
    const versionIds = new Set<number>();
    for (const period of periods) {
      versionIds.add((await resolveFinanceAccountingPolicyVersionAtInTransaction(tx, period.endDate)).id);
    }
    const totals = { written: 0, updated: 0, deleted: 0, skippedProtected: 0 };
    for (const policyVersionId of versionIds) {
      const sourceGroupAccountIds = [...new Set(rules
        .filter((rule) => rule.policyVersionId === policyVersionId)
        .map((rule) => rule.sourceGroupAccountId))];
      if (!sourceGroupAccountIds.length) continue;
      const materialized = await materializeConfirmedReclassAdjustments(tx, policyVersionId, sourceGroupAccountIds);
      totals.written += materialized.auxiliary.written + materialized.automatic.written;
      totals.updated += materialized.auxiliary.updated + materialized.automatic.updated;
      totals.deleted += materialized.auxiliary.deleted + materialized.automatic.deleted;
      totals.skippedProtected += materialized.auxiliary.skippedProtected + materialized.automatic.skippedProtected;
    }
    return totals;
  }, { maxWait: 10_000, timeout: 60_000 });
  return {
    periods: periods.length,
    ...result,
  };
}
