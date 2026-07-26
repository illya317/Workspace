import { prisma } from "@workspace/platform/server/prisma";
import { balanceSheetOpeningReclassPoint } from "@workspace/finance/types/statement-period";
import type { ReclassEntry, ReportPeriod } from "./report-helpers";

interface ReclassAdjustmentRow {
  sourceAccountCode: string;
  targetAccountCode: string | null;
  amount: number;
}

export interface BalanceSheetPeriodReclassEntries {
  closing: ReclassEntry[];
  opening: ReclassEntry[];
}

export async function findBalanceSheetOpeningReclassPeriodId(
  period: ReportPeriod,
) {
  if (!period.companyCode) throw new Error("资产负债表期间缺少公司编号");
  const openingPeriod = balanceSheetOpeningReclassPoint(period);
  const previousPeriod = await prisma.financePeriod.findFirst({
    where: {
      companyCode: period.companyCode,
      year: openingPeriod.year,
      month: openingPeriod.month,
    },
    select: { id: true },
  });
  return previousPeriod?.id ?? null;
}

function toReclassEntries(rows: ReclassAdjustmentRow[]): ReclassEntry[] {
  return rows.flatMap((row) => row.targetAccountCode ? [{
    sourceAccount: row.sourceAccountCode,
    targetAccount: row.targetAccountCode,
    amount: row.amount,
  }] : []);
}

async function findApprovedEntries(periodId: number) {
  return prisma.financeBalanceReclassAdjustment.findMany({
    where: {
      periodId,
      decision: "reclassify",
      targetAccountCode: { not: null },
      status: { in: ["approved", "adjusted"] },
    },
    select: { sourceAccountCode: true, targetAccountCode: true, amount: true },
  });
}

export async function loadBalanceSheetPeriodReclassEntries(
  period: ReportPeriod,
): Promise<BalanceSheetPeriodReclassEntries> {
  if (!period.companyCode) throw new Error("资产负债表期间缺少公司编号");
  const [closingRows, previousPeriodId] = await Promise.all([
    findApprovedEntries(period.id),
    findBalanceSheetOpeningReclassPeriodId(period),
  ]);
  const openingRows = previousPeriodId
    ? await findApprovedEntries(previousPeriodId)
    : [];

  return {
    closing: toReclassEntries(closingRows),
    opening: toReclassEntries(openingRows),
  };
}
