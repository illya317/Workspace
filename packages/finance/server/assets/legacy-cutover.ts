import { moneyEquals } from "./money-cents";

export const FINANCE_ASSET_LEGACY_CUTOVER_MODE = "legacy_cutover" as const;

export type FinanceAssetLegacyCutoverBasis = {
  originalCost: number;
  openingAccumulatedAmount: number;
  openingImpairmentAmount: number;
  openingNetBookValue: number;
  cutoverDate: string;
  remainingUsefulLifeMonthsAtCutover: number;
  cutoverResidualValue: number;
};

export type FinanceAssetLegacyCutoverPeriodInput = FinanceAssetLegacyCutoverBasis & {
  accumulatedBefore: number;
  impairmentBefore: number;
  year: number;
  month: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateFinanceAssetLegacyCutoverBasis(input: FinanceAssetLegacyCutoverBasis) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.cutoverDate)) throw new Error("资产历史切点日期必须为 YYYY-MM-DD");
  for (const [label, value] of [
    ["资产原值", input.originalCost],
    ["期初累计折旧摊销", input.openingAccumulatedAmount],
    ["期初减值", input.openingImpairmentAmount],
    ["切点净值", input.openingNetBookValue],
    ["切点剩余残值", input.cutoverResidualValue],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label}必须为非负金额`);
  }
  if (!Number.isInteger(input.remainingUsefulLifeMonthsAtCutover) || input.remainingUsefulLifeMonthsAtCutover < 0) {
    throw new Error("切点剩余折旧摊销月份必须为非负整数");
  }
  if (!moneyEquals(
    input.originalCost - input.openingAccumulatedAmount - input.openingImpairmentAmount,
    input.openingNetBookValue,
  )) {
    throw new Error("资产切点原值、累计折旧摊销、减值与净值不闭合");
  }
  if (input.cutoverResidualValue > input.openingNetBookValue && !moneyEquals(input.cutoverResidualValue, input.openingNetBookValue)) {
    throw new Error("切点剩余残值不得高于切点净值");
  }
  const remainingDepreciable = money(input.openingNetBookValue - input.cutoverResidualValue);
  if (input.remainingUsefulLifeMonthsAtCutover === 0 && !moneyEquals(remainingDepreciable, 0)) {
    throw new Error("仍有可折旧摊销净值时，切点剩余月份不得为零");
  }
  if (input.remainingUsefulLifeMonthsAtCutover > 0 && moneyEquals(remainingDepreciable, 0)) {
    throw new Error("切点净值已等于剩余残值时，切点剩余月份必须为零");
  }
  return input;
}

export function calculateFinanceAssetLegacyCutoverPeriod(input: FinanceAssetLegacyCutoverPeriodInput) {
  validateFinanceAssetLegacyCutoverBasis(input);
  if (input.accumulatedBefore + 0.005 < input.openingAccumulatedAmount) throw new Error("累计折旧摊销不得低于切点承接金额");
  if (input.impairmentBefore + 0.005 < input.openingImpairmentAmount) throw new Error("累计减值不得低于切点承接金额");
  const cutoverMonth = monthIndex(input.cutoverDate);
  const targetMonth = input.year * 12 + input.month - 1;
  const elapsedBefore = targetMonth - cutoverMonth - 1;
  const cutoverDepreciable = money(input.openingNetBookValue - input.cutoverResidualValue);
  const subsequentAccumulated = money(input.accumulatedBefore - input.openingAccumulatedAmount);
  const subsequentImpairment = money(input.impairmentBefore - input.openingImpairmentAmount);
  const remainingAmount = money(Math.max(0, cutoverDepreciable - subsequentAccumulated - subsequentImpairment));
  const remainingMonths = Math.max(0, input.remainingUsefulLifeMonthsAtCutover - Math.max(0, elapsedBefore));
  const eligible = elapsedBefore >= 0 && remainingMonths > 0 && remainingAmount > 0;
  const baseMonthlyAmount = input.remainingUsefulLifeMonthsAtCutover > 0
    ? money(cutoverDepreciable / input.remainingUsefulLifeMonthsAtCutover)
    : 0;
  const monthlyAmount = subsequentImpairment > 0 && remainingMonths > 0
    ? money(remainingAmount / remainingMonths)
    : baseMonthlyAmount;
  const periodAmount = eligible
    ? money(remainingMonths === 1 ? remainingAmount : Math.min(monthlyAmount, remainingAmount))
    : 0;
  const accumulatedAfter = money(input.accumulatedBefore + periodAmount);
  return {
    monthlyAmount,
    periodAmount,
    depreciableAmount: money(input.originalCost - input.cutoverResidualValue - input.impairmentBefore),
    accumulatedAfter,
    netBookValue: money(input.originalCost - accumulatedAfter - input.impairmentBefore),
    active: eligible,
  };
}

export function firstMonthAfterFinanceAssetCutover(cutoverDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cutoverDate);
  if (!match) throw new Error("资产历史切点日期必须为 YYYY-MM-DD");
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
  return next.toISOString().slice(0, 10);
}

function monthIndex(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("日期必须为 YYYY-MM-DD");
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}
