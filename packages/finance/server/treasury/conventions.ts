import type { DayCountConvention } from "../../types/treasury";

export function resolveUniqueLoanDayCountConvention(values: string[]): DayCountConvention | null {
  const conventions = new Set(values);
  if (conventions.size !== 1) return null;
  const value = [...conventions][0];
  return value === "actual_365" || value === "actual_360" || value === "30_360" ? value : null;
}
