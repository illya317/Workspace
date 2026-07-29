import type { FinanceAssetCardAccountReferences, FinanceAssetCardCreateCommand, FinanceAssetCardUpdateCommand } from "./validation";
import { residualRatePercentToDecimal } from "./validation";
import { requireStoredFinanceAssetDepreciationMethod } from "./depreciation-method";

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function assetCardWriteData(
  input: FinanceAssetCardCreateCommand["input"] | FinanceAssetCardUpdateCommand["input"],
  accounts: FinanceAssetCardAccountReferences,
  userId: number,
  assetCode: string,
) {
  return {
    companyCode: input.companyCode,
    assetCode,
    name: input.name,
    assetKind: input.assetKind,
    categoryId: input.categoryId,
    assetAccountCode: accounts.asset.code,
    assetAccountId: accounts.asset.id,
    accumulatedAccountCode: accounts.accumulated?.code ?? null,
    accumulatedAccountId: accounts.accumulated?.id ?? null,
    acquisitionDate: input.acquisitionDate || null,
    depreciationStartDate: input.depreciationStartDate || null,
    originalCost: input.originalCost,
    residualRate: residualRatePercentToDecimal(input.residualRatePercent ?? 0),
    usefulLifeMonths: input.usefulLifeMonths ?? null,
    method: requireStoredFinanceAssetDepreciationMethod(input.method, `资产 ${assetCode}`),
    openingAccumulatedAmount: input.openingAccumulatedAmount ?? 0,
    openingAsOfDate: input.openingAsOfDate || null,
    nonAmortizationReason: input.nonAmortizationReason || null,
    note: input.note || null,
    editedBy: userId,
  };
}

export function assetAccountingBasisChanged(
  existing: {
    companyCode: string;
    assetKind: string;
    categoryId: number;
    assetAccountCode: string;
    assetAccountId: number | null;
    accumulatedAccountCode: string | null;
    accumulatedAccountId: number | null;
    acquisitionDate: string | null;
    depreciationStartDate: string | null;
    originalCost: unknown;
    residualRate: unknown;
    usefulLifeMonths: number | null;
    method: string;
    openingAccumulatedAmount: unknown;
    openingAsOfDate: string | null;
    nonAmortizationReason: string | null;
  },
  requested: ReturnType<typeof assetCardWriteData>,
) {
  return existing.companyCode !== requested.companyCode
    || existing.assetKind !== requested.assetKind
    || existing.categoryId !== requested.categoryId
    || existing.assetAccountCode !== requested.assetAccountCode
    || existing.assetAccountId !== requested.assetAccountId
    || existing.accumulatedAccountCode !== requested.accumulatedAccountCode
    || existing.accumulatedAccountId !== requested.accumulatedAccountId
    || existing.acquisitionDate !== requested.acquisitionDate
    || existing.depreciationStartDate !== requested.depreciationStartDate
    || money(existing.originalCost) !== money(requested.originalCost)
    || Number(existing.residualRate) !== Number(requested.residualRate)
    || existing.usefulLifeMonths !== requested.usefulLifeMonths
    || existing.method !== requested.method
    || money(existing.openingAccumulatedAmount) !== money(requested.openingAccumulatedAmount)
    || existing.openingAsOfDate !== requested.openingAsOfDate
    || (existing.nonAmortizationReason ?? null) !== (requested.nonAmortizationReason ?? null);
}
