/**
 * 规则变更后自动同步全年 ReclassResult
 */
import { prisma } from "@workspace/platform/server/prisma";
import { buildReclassResults } from "../reclassify";
import { syncBalanceReclassForYear } from "../balance-reclass";
import { buildReclassRuleScopeCommand } from "../../domain/finance-validation";

export interface SyncReclassResult {
  periods: number;
  synced: number;
  skippedAdjusted: number;
}

export async function syncReclassRuleResults(
  companyCode: string,
  year: number,
): Promise<SyncReclassResult> {
  const command = buildReclassRuleScopeCommand(companyCode, year);
  if (!command.ok) throw new Error(command.issue.message);
  const periods = await prisma.financePeriod.findMany({
    where: { companyCode: command.data.companyCode, year: command.data.year },
    select: { id: true },
  });

  let synced = 0, skippedAdjusted = 0;
  for (const p of periods) {
    const result = await buildReclassResults(p.id, { dryRun: false });
    if ("written" in result) {
      synced += result.written;
      skippedAdjusted += result.skippedAdjusted;
    }
  }

  // 同步余额层 residual reclass
  await syncBalanceReclassForYear(command.data.companyCode, command.data.year);

  return { periods: periods.length, synced, skippedAdjusted };
}
