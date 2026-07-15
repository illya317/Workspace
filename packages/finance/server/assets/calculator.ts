export type StraightLinePeriodInput = {
  originalCost: number;
  residualRate: number;
  usefulLifeMonths: number;
  accumulatedBefore: number;
  depreciationStartDate: string;
  year: number;
  month: number;
};

export type StraightLinePeriodResult = {
  monthlyAmount: number;
  periodAmount: number;
  depreciableAmount: number;
  accumulatedAfter: number;
  netBookValue: number;
  active: boolean;
};

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function monthIndex(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("日期必须为 YYYY-MM-DD");
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

export function calculateStraightLinePeriod(input: StraightLinePeriodInput): StraightLinePeriodResult {
  if (!Number.isFinite(input.originalCost) || input.originalCost < 0) throw new Error("资产原值必须大于等于 0");
  if (!Number.isFinite(input.residualRate) || input.residualRate < 0 || input.residualRate >= 1) {
    throw new Error("残值率必须在 0（含）到 1（不含）之间");
  }
  if (!Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths <= 0) throw new Error("使用期限月数必须为正整数");
  const depreciableAmount = cents(input.originalCost * (1 - input.residualRate));
  const accumulatedBefore = Math.max(0, cents(input.accumulatedBefore));
  const monthlyAmount = cents(depreciableAmount / input.usefulLifeMonths);
  const targetMonth = input.year * 12 + input.month - 1;
  const active = targetMonth >= monthIndex(input.depreciationStartDate) && accumulatedBefore < depreciableAmount;
  const periodAmount = active ? cents(Math.min(monthlyAmount, depreciableAmount - accumulatedBefore)) : 0;
  const accumulatedAfter = cents(Math.min(depreciableAmount, accumulatedBefore + periodAmount));
  return {
    monthlyAmount,
    periodAmount,
    depreciableAmount,
    accumulatedAfter,
    netBookValue: cents(input.originalCost - accumulatedAfter),
    active,
  };
}
