export type StraightLinePeriodInput = {
  originalCost: number;
  residualRate: number;
  usefulLifeMonths: number;
  accumulatedBefore: number;
  impairmentBefore?: number;
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
  const impairmentBefore = Math.max(0, cents(input.impairmentBefore ?? 0));
  const depreciableAmount = Math.max(0, cents(input.originalCost * (1 - input.residualRate) - impairmentBefore));
  const accumulatedBefore = Math.max(0, cents(input.accumulatedBefore));
  const targetMonth = input.year * 12 + input.month - 1;
  const startMonth = monthIndex(input.depreciationStartDate);
  const elapsedBefore = Math.max(0, targetMonth - startMonth);
  const remainingLifeMonths = Math.max(1, input.usefulLifeMonths - elapsedBefore);
  const monthlyAmount = impairmentBefore > 0
    ? cents(Math.max(0, depreciableAmount - accumulatedBefore) / remainingLifeMonths)
    : cents(depreciableAmount / input.usefulLifeMonths);
  const active = targetMonth >= startMonth && accumulatedBefore < depreciableAmount;
  const periodAmount = active ? cents(Math.min(monthlyAmount, depreciableAmount - accumulatedBefore)) : 0;
  const accumulatedAfter = cents(Math.min(depreciableAmount, accumulatedBefore + periodAmount));
  return {
    monthlyAmount,
    periodAmount,
    depreciableAmount,
    accumulatedAfter,
    netBookValue: cents(input.originalCost - impairmentBefore - accumulatedAfter),
    active,
  };
}

export function calculateFinanceAssetPeriod(input: StraightLinePeriodInput & {
  assetKind: "fixed_asset" | "intangible" | "prepaid" | "long_term_deferred";
  disposalDate?: string | null;
  initializationMode?: "standard" | typeof FINANCE_ASSET_LEGACY_CUTOVER_MODE;
  legacyCutover?: FinanceAssetLegacyCutoverBasis;
}) {
  const normal = input.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE
    ? calculateFinanceAssetLegacyCutoverPeriod({
        ...(input.legacyCutover ?? missingLegacyCutoverBasis()),
        accumulatedBefore: input.accumulatedBefore,
        impairmentBefore: input.impairmentBefore ?? 0,
        year: input.year,
        month: input.month,
      })
    : calculateStraightLinePeriod(input);
  if (!input.disposalDate) return { ...normal, lifecycleBlocker: null as string | null };
  const targetMonth = input.year * 12 + input.month - 1;
  const disposalMonth = monthIndex(input.disposalDate);
  if (disposalMonth < targetMonth) return { ...normal, periodAmount: 0, active: false, lifecycleBlocker: null as string | null };
  if (disposalMonth > targetMonth || input.assetKind === "fixed_asset") return { ...normal, lifecycleBlocker: null as string | null };
  if (input.assetKind === "intangible") {
    const accumulatedAfter = cents(Math.min(normal.depreciableAmount, input.accumulatedBefore));
    return { ...normal, periodAmount: 0, accumulatedAfter, netBookValue: cents(input.originalCost - (input.impairmentBefore ?? 0) - accumulatedAfter), active: false, lifecycleBlocker: null as string | null };
  }
  return { ...normal, lifecycleBlocker: "asset_termination_policy_missing" };
}

function missingLegacyCutoverBasis(): never {
  throw new Error("历史切点资产缺少承接基础");
}
import {
  calculateFinanceAssetLegacyCutoverPeriod,
  FINANCE_ASSET_LEGACY_CUTOVER_MODE,
  type FinanceAssetLegacyCutoverBasis,
} from "./legacy-cutover";
