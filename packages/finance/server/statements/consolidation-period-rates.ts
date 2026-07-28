export type ConsolidationRatePeriodBasis = "current" | "comparative";

export interface ConsolidationPeriodRateRequirements {
  closing: Record<ConsolidationRatePeriodBasis, string[]>;
  monthlyAverage: Record<ConsolidationRatePeriodBasis, string[]>;
}

export function consolidationMonthEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function consolidationPreviousMonthEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

function yearToDateMonthEnds(year: number, month: number) {
  return Array.from({ length: month }, (_, index) => consolidationMonthEndDate(year, index + 1));
}

function uniqueDates(dates: string[]) {
  return [...new Set(dates)].sort();
}

export function consolidationPeriodRateRequirements(
  year: number,
  month: number,
): ConsolidationPeriodRateRequirements {
  if (!Number.isInteger(year) || year < 1900 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("合并报表期间无效");
  }
  return {
    closing: {
      current: uniqueDates([
        consolidationMonthEndDate(year, month),
        consolidationMonthEndDate(year - 1, 12),
        consolidationPreviousMonthEndDate(year, month),
      ]),
      comparative: uniqueDates([
        consolidationMonthEndDate(year - 1, month),
        consolidationMonthEndDate(year - 2, 12),
        consolidationPreviousMonthEndDate(year - 1, month),
      ]),
    },
    monthlyAverage: {
      current: yearToDateMonthEnds(year, month),
      comparative: yearToDateMonthEnds(year - 1, month),
    },
  };
}
