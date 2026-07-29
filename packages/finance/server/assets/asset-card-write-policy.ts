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
    initializationMode: "standard",
    openingAccumulatedAmount: input.openingAccumulatedAmount ?? 0,
    openingImpairmentAmount: 0,
    openingNetBookValue: null,
    openingAsOfDate: input.openingAsOfDate || null,
    cutoverDate: null,
    remainingUsefulLifeMonthsAtCutover: null,
    cutoverResidualValue: null,
    cutoverAllocationStatus: null,
    cutoverReconciliationFingerprint: null,
    cutoverPeriodId: null,
    cutoverAssetBalanceId: null,
    cutoverAccumulatedBalanceId: null,
    cutoverImpairmentBalanceId: null,
    nonAmortizationReason: input.nonAmortizationReason || null,
    note: input.note || null,
    editedBy: userId,
  };
}

type AssetAccountingBasis = {
    assetCode?: string;
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
    openingImpairmentAmount: unknown;
    openingNetBookValue: unknown;
    openingAsOfDate: string | null;
    initializationMode: string;
    cutoverDate: string | null;
    remainingUsefulLifeMonthsAtCutover: number | null;
    cutoverResidualValue: unknown;
    cutoverAllocationStatus: string | null;
    cutoverReconciliationFingerprint: string | null;
    cutoverPeriodId: number | null;
    cutoverAssetBalanceId: number | null;
    cutoverAccumulatedBalanceId: number | null;
    cutoverImpairmentBalanceId: number | null;
    nonAmortizationReason: string | null;
};

export function assetAccountingBasisChanged(
  existing: AssetAccountingBasis,
  requested: AssetAccountingBasis,
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
    || money(existing.openingImpairmentAmount ?? 0) !== money(requested.openingImpairmentAmount)
    || nullableMoney(existing.openingNetBookValue) !== nullableMoney(requested.openingNetBookValue)
    || existing.openingAsOfDate !== requested.openingAsOfDate
    || (existing.initializationMode ?? "standard") !== requested.initializationMode
    || (existing.cutoverDate ?? null) !== requested.cutoverDate
    || (existing.remainingUsefulLifeMonthsAtCutover ?? null) !== requested.remainingUsefulLifeMonthsAtCutover
    || nullableMoney(existing.cutoverResidualValue) !== nullableMoney(requested.cutoverResidualValue)
    || (existing.cutoverAllocationStatus ?? null) !== requested.cutoverAllocationStatus
    || (existing.cutoverReconciliationFingerprint ?? null) !== requested.cutoverReconciliationFingerprint
    || (existing.cutoverPeriodId ?? null) !== requested.cutoverPeriodId
    || (existing.cutoverAssetBalanceId ?? null) !== requested.cutoverAssetBalanceId
    || (existing.cutoverAccumulatedBalanceId ?? null) !== requested.cutoverAccumulatedBalanceId
    || (existing.cutoverImpairmentBalanceId ?? null) !== requested.cutoverImpairmentBalanceId
    || (existing.nonAmortizationReason ?? null) !== (requested.nonAmortizationReason ?? null);
}

function nullableMoney(value: unknown) {
  return value == null ? null : money(value);
}
