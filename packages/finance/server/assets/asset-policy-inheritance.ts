export type FinanceAssetPolicySemanticSnapshot = {
  assetAccountCode: string | null;
  accumulatedAccountCode: string | null;
  expenseAccountCode: string | null;
  impairmentLossAccountCode: string | null;
  impairmentAllowanceAccountCode: string | null;
  disposalGainLossAccountCode: string | null;
  defaultUsefulLifeMonths: number | null;
  defaultResidualRatePercent: number | null;
  defaultMethod: string;
  usefulLifeMode: string;
  minimumUsefulLifeMonths: number | null;
  maximumUsefulLifeMonths: number | null;
  reviewRequired: boolean;
  classificationRule: string;
};

export function financeAssetPolicySemanticsMatch(
  left: FinanceAssetPolicySemanticSnapshot,
  right: FinanceAssetPolicySemanticSnapshot,
) {
  return left.assetAccountCode === right.assetAccountCode
    && left.accumulatedAccountCode === right.accumulatedAccountCode
    && left.expenseAccountCode === right.expenseAccountCode
    && left.impairmentLossAccountCode === right.impairmentLossAccountCode
    && left.impairmentAllowanceAccountCode === right.impairmentAllowanceAccountCode
    && left.disposalGainLossAccountCode === right.disposalGainLossAccountCode
    && left.defaultUsefulLifeMonths === right.defaultUsefulLifeMonths
    && left.defaultResidualRatePercent === right.defaultResidualRatePercent
    && left.defaultMethod === right.defaultMethod
    && left.usefulLifeMode === right.usefulLifeMode
    && left.minimumUsefulLifeMonths === right.minimumUsefulLifeMonths
    && left.maximumUsefulLifeMonths === right.maximumUsefulLifeMonths
    && left.reviewRequired === right.reviewRequired
    && left.classificationRule === right.classificationRule;
}
