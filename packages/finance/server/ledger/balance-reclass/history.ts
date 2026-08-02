import type { Prisma } from "@workspace/platform/server/prisma";

import { buildArchiveBalanceReclassAdjustmentCommand } from "../validation";

export interface BalanceReclassAdjustmentSnapshot {
  id: number;
  policyVersionId: number;
  sourceGroupAccountId: number | null;
  targetGroupAccountId: number | null;
  periodId: number;
  companyCode: string;
  year: number;
  sourceAccountCode: string;
  targetAccountCode: string | null;
  amount: number;
  decision: string;
  sourceType: string;
  status: string;
  ruleId: number | null;
  adjustedBy: number | null;
  adjustedAt: Date | null;
  note: string | null;
}

export async function archiveBalanceReclassAdjustment(
  tx: Prisma.TransactionClient,
  row: BalanceReclassAdjustmentSnapshot,
  archiveReason: string,
  archivedBy?: number | null,
) {
  const command = buildArchiveBalanceReclassAdjustmentCommand({
    adjustmentId: row.id,
    periodId: row.periodId,
    archiveReason,
    archivedBy,
  });
  if (!command.ok) throw new Error(command.issue.message);
  return tx.financeBalanceReclassAdjustmentHistory.create({
    data: {
      adjustmentIdSnapshot: command.data.adjustmentId,
      policyVersionIdSnapshot: row.policyVersionId,
      sourceGroupAccountIdSnapshot: row.sourceGroupAccountId,
      targetGroupAccountIdSnapshot: row.targetGroupAccountId,
      periodId: command.data.periodId,
      companyCode: row.companyCode,
      year: row.year,
      sourceAccountCode: row.sourceAccountCode,
      targetAccountCode: row.targetAccountCode,
      amount: row.amount,
      decision: row.decision,
      sourceType: row.sourceType,
      status: row.status,
      ruleIdSnapshot: row.ruleId,
      adjustedBySnapshot: row.adjustedBy,
      adjustedAtSnapshot: row.adjustedAt,
      note: row.note,
      archiveReason: command.data.archiveReason,
      archivedBy: command.data.archivedBy,
    },
  });
}

export function hasSameBalanceReclassResult(
  row: BalanceReclassAdjustmentSnapshot,
  next: {
    policyVersionId: number;
    sourceGroupAccountId: number | null;
    targetGroupAccountId: number | null;
    targetAccountCode: string | null;
    amount: number;
    decision: string;
    sourceType: string;
    status: string;
    ruleId: number | null;
  },
) {
  return row.policyVersionId === next.policyVersionId
    && row.sourceGroupAccountId === next.sourceGroupAccountId
    && row.targetGroupAccountId === next.targetGroupAccountId
    && row.targetAccountCode === next.targetAccountCode
    && roundMoney(row.amount) === roundMoney(next.amount)
    && row.decision === next.decision
    && row.sourceType === next.sourceType
    && row.status === next.status
    && row.ruleId === next.ruleId;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
