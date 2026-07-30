export type FinanceAssetCardIdempotencyFields = {
  companyCode: string;
  assetCode: string;
  name: string;
  assetKind: string;
  categoryId: number;
  assetAccountCode: string;
  accumulatedAccountCode: string | null;
  acquisitionDate: string | null;
  depreciationStartDate: string | null;
  originalCost: unknown;
  residualRate: unknown;
  usefulLifeMonths: number | null;
  method: string;
  openingAccumulatedAmount: unknown;
  openingAsOfDate: string | null;
  nonAmortizationReason: string | null;
  note: string | null;
  editedBy: number | null;
};

export function financeAssetCreateCommandMatches(
  existing: FinanceAssetCardIdempotencyFields,
  expected: FinanceAssetCardIdempotencyFields,
) {
  return existing.companyCode === expected.companyCode
    && existing.assetCode === expected.assetCode
    && existing.name === expected.name
    && existing.assetKind === expected.assetKind
    && existing.categoryId === expected.categoryId
    && existing.assetAccountCode === expected.assetAccountCode
    && existing.accumulatedAccountCode === expected.accumulatedAccountCode
    && existing.acquisitionDate === expected.acquisitionDate
    && existing.depreciationStartDate === expected.depreciationStartDate
    && Number(existing.originalCost) === Number(expected.originalCost)
    && Number(existing.residualRate) === Number(expected.residualRate)
    && existing.usefulLifeMonths === expected.usefulLifeMonths
    && existing.method === expected.method
    && Number(existing.openingAccumulatedAmount) === Number(expected.openingAccumulatedAmount)
    && existing.openingAsOfDate === expected.openingAsOfDate
    && existing.nonAmortizationReason === expected.nonAmortizationReason
    && existing.note === expected.note
    && existing.editedBy === expected.editedBy;
}
