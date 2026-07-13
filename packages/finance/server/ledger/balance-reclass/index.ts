/**
 * Generic account-level residual reclassification has been retired.
 *
 * A net account balance cannot reveal individual suppliers/customers on the
 * opposite side. Correct automatic adjustments are written by the auxiliary
 * closing-balance importer. These functions only remove stale automatic
 * residual rows while preserving human-reviewed adjustments.
 */
import { prisma } from "@workspace/platform/server/prisma";

import { buildBalanceComputeCommand, buildReclassRuleScopeCommand } from "../../domain/finance-validation";

export async function syncBalanceReclassForPeriod(periodId: number): Promise<{ written: number; deleted: number }> {
  const command = buildBalanceComputeCommand(periodId);
  if (!command.ok) throw new Error(command.issue.message);
  const deleted = await prisma.financeBalanceReclassAdjustment.deleteMany({
    where: {
      periodId: command.data.id,
      sourceType: "balance_residual",
      status: "approved",
    },
  });
  return { written: 0, deleted: deleted.count };
}

export async function syncBalanceReclassForYear(companyCode: string, year: number) {
  const command = buildReclassRuleScopeCommand(companyCode, year);
  if (!command.ok) throw new Error(command.issue.message);
  const periods = await prisma.financePeriod.findMany({
    where: { companyCode: command.data.companyCode, year: command.data.year },
    select: { id: true },
  });
  let deleted = 0;
  for (const period of periods) {
    const result = await syncBalanceReclassForPeriod(period.id);
    deleted += result.deleted;
  }
  return { periods: periods.length, written: 0, deleted };
}
