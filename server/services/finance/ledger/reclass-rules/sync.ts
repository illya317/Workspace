/**
 * 规则变更后自动同步全年 ReclassResult
 */
import { prisma } from "@/lib/prisma";
import { buildReclassResults } from "../reclassify";

export interface SyncReclassResult {
  periods: number;
  synced: number;
  skippedAdjusted: number;
}

export async function syncReclassRuleResults(
  companyCode: string,
  year?: number,
): Promise<SyncReclassResult> {
  const periods = await prisma.financePeriod.findMany({
    where: { companyCode, ...(year ? { year } : {}) },
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

  return { periods: periods.length, synced, skippedAdjusted };
}
