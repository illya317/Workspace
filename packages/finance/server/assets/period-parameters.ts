import { prisma } from "@workspace/platform/server/prisma";

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export type AssetPeriodParameterBasis = {
  id: number;
  initializationMode: string;
  originalCost: unknown;
  residualRate: unknown;
  usefulLifeMonths: number | null;
  openingAccumulatedAmount: unknown;
  openingImpairmentAmount: unknown;
  openingAsOfDate: string | null;
};

export type AssetPeriodParameterPriors = {
  entries: Array<{ assetId: number; normalAmount: number; periodEndDate: string }>;
  adjustments: Array<{ assetId: number | null; amount: number; periodEndDate: string }>;
  impairments: Array<{ assetId: number; amount: number; periodEndDate: string }>;
};

export type AssetPeriodParameters = {
  impairmentBefore: number;
  accumulatedBefore: number;
  monthlyAmount: number | null;
};

/** 加载本期折旧摊销行展示计算参数所需的更早期间事实（纯展示，不做凭证校验）。 */
export async function loadAssetPeriodParameterPriors(
  assetIds: number[],
  companyCode: string,
  scope: { year: number; month: number },
): Promise<AssetPeriodParameterPriors> {
  const earlierPeriod = { OR: [{ year: { lt: scope.year } }, { year: scope.year, month: { lt: scope.month } }] };
  const [entries, adjustments, impairments] = await Promise.all([
    prisma.financeAssetPeriodEntry.findMany({
      where: { assetId: { in: assetIds }, period: earlierPeriod },
      select: { assetId: true, normalAmount: true, period: { select: { endDate: true } } },
    }),
    prisma.financeAssetAdjustment.findMany({
      where: { companyCode, assetId: { not: null }, status: "confirmed", period: earlierPeriod },
      select: { assetId: true, amount: true, period: { select: { endDate: true } } },
    }),
    prisma.financeAssetImpairmentAllocation.findMany({
      where: { assetId: { in: assetIds }, assessment: { status: "confirmed", period: earlierPeriod } },
      select: { assetId: true, amount: true, assessment: { select: { period: { select: { endDate: true } } } } },
    }),
  ]);
  return {
    entries: entries.map((row) => ({ assetId: row.assetId, normalAmount: money(row.normalAmount), periodEndDate: row.period.endDate })),
    adjustments: adjustments.map((row) => ({ assetId: row.assetId, amount: money(row.amount), periodEndDate: row.period.endDate })),
    impairments: impairments.map((row) => ({ assetId: row.assetId, amount: money(row.amount), periodEndDate: row.assessment.period.endDate })),
  };
}

/** 重放期初累计与减值金额，口径对齐 accumulated-replay（仅展示用途，不做凭证门槛校验）。 */
export function assetPeriodParameters(
  basis: AssetPeriodParameterBasis,
  priors: AssetPeriodParameterPriors,
): AssetPeriodParameters {
  const afterOpening = (periodEndDate: string) => !basis.openingAsOfDate || periodEndDate > basis.openingAsOfDate;
  let accumulated = money(basis.openingAccumulatedAmount);
  for (const entry of priors.entries) {
    if (entry.assetId === basis.id && afterOpening(entry.periodEndDate)) accumulated = money(accumulated + money(entry.normalAmount));
  }
  for (const adjustment of priors.adjustments) {
    if (adjustment.assetId === basis.id && afterOpening(adjustment.periodEndDate)) accumulated = money(accumulated + money(adjustment.amount));
  }
  const legacyCutover = basis.initializationMode === "legacy_cutover";
  let impairment = money(basis.openingImpairmentAmount);
  for (const row of priors.impairments) {
    if (row.assetId === basis.id && (!legacyCutover || afterOpening(row.periodEndDate))) impairment = money(impairment + money(row.amount));
  }
  const impairmentBefore = Math.max(0, impairment);
  const monthlyAmount = !legacyCutover && impairmentBefore === 0 && basis.usefulLifeMonths != null
    ? money(Math.max(0, money(Number(basis.originalCost) * (1 - Number(basis.residualRate)))) / basis.usefulLifeMonths)
    : null;
  return { impairmentBefore, accumulatedBefore: Math.max(0, accumulated), monthlyAmount };
}
