/**
 * Voucher movements cannot determine balance-sheet reclassification.
 *
 * Reclassification is now generated exclusively from counterparty closing
 * balances imported through the auxiliary-balance path. This legacy entry
 * point remains so existing routes can clear stale automatic voucher results
 * without touching human-adjusted or rejected rows.
 */
import { prisma } from "@workspace/platform/server/prisma";

import { buildReclassBuildCommand } from "../../domain/finance-validation";
import { ItemStatus } from "./types";
import type {
  BuildReclassResultsOptions,
  ReclassifyExecutionResult,
  ReclassifyItemResult,
  ReclassifySummary,
} from "./types";

export async function buildReclassResults(
  periodId: number,
  opts: BuildReclassResultsOptions = {},
): Promise<ReclassifySummary | ReclassifyExecutionResult> {
  const command = buildReclassBuildCommand(periodId);
  if (!command.ok) throw new Error(command.issue.message);
  const period = await prisma.financePeriod.findUnique({
    where: { id: command.data.id },
    select: { id: true },
  });
  if (!period) throw new Error(`Period ${command.data.id} not found`);

  const items = await prisma.financeVoucherItem.findMany({
    where: {
      voucher: { periodId: command.data.id, status: "posted" },
      OR: [{ debit: { gt: 0 } }, { credit: { gt: 0 } }],
    },
    select: { id: true, account: { select: { code: true } } },
  });
  const skippedSamples: ReclassifyItemResult[] = items.slice(0, 5).map((item) => ({
    voucherItemId: item.id,
    sourceAccount: item.account.code,
    targetAccount: null,
    amount: 0,
    status: ItemStatus.SKIPPED,
    ruleId: null,
  }));
  const summary: ReclassifySummary = {
    periodId: command.data.id,
    total: items.length,
    matched: 0,
    skipped: items.length,
    noRule: 0,
    noEntity: 0,
    invalidTarget: 0,
    samples: {
      matched: [],
      skipped: skippedSamples,
      no_rule: [],
      no_entity: [],
      invalid_target: [],
    },
  };
  if (opts.dryRun ?? true) return summary;

  const skippedAdjusted = await prisma.reclassResult.count({
    where: { periodId: command.data.id, status: { in: ["adjusted", "rejected"] } },
  });
  await prisma.reclassResult.deleteMany({
    where: { periodId: command.data.id, status: { in: ["pending", "approved"] } },
  });
  return { ...summary, written: 0, skippedAdjusted };
}
