export interface FinancePeriodOption {
  companyCode: string;
  year: number;
  month: number;
}

export function normalizeFinancePeriodOptions(
  periods: readonly { companyCode: string | null; year: number; month: number }[],
  allowedCompanyCodes?: readonly string[],
) {
  const allowed = allowedCompanyCodes ? new Set(allowedCompanyCodes) : null;
  const unique = new Map<string, FinancePeriodOption>();
  for (const period of periods) {
    if (!period.companyCode || allowed && !allowed.has(period.companyCode)) continue;
    unique.set(`${period.companyCode}:${period.year}:${period.month}`, {
      companyCode: period.companyCode,
      year: period.year,
      month: period.month,
    });
  }
  return [...unique.values()].sort((left, right) => (
    right.year - left.year
    || right.month - left.month
    || left.companyCode.localeCompare(right.companyCode)
  ));
}

export function latestAvailableFinancePeriod(
  periods: readonly FinancePeriodOption[],
  now = new Date(),
) {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return periods.find((period) => (
    period.year < currentYear || period.year === currentYear && period.month <= currentMonth
  )) ?? periods[0] ?? null;
}

export function adjacentAvailableFinancePeriod(
  periods: readonly FinancePeriodOption[],
  current: Pick<FinancePeriodOption, "year" | "month">,
  delta: -1 | 1,
) {
  const chronological = [...periods].sort((left, right) => left.year - right.year || left.month - right.month);
  const index = chronological.findIndex((period) => period.year === current.year && period.month === current.month);
  return index < 0 ? null : chronological[index + delta] ?? null;
}
