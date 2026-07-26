export type SystemOkrCycleWindow = {
  id: number;
  periodType: string;
  startDate: Date;
  endDate: Date;
};

export function selectVisibleSystemOkrCycles<T extends SystemOkrCycleWindow>(rows: readonly T[], now: Date) {
  const visibleById = new Map<number, T>();
  let firstFutureYear: T | null = null;
  for (const row of rows) {
    if (startOfUtcDay(row.startDate) <= now) {
      visibleById.set(row.id, row);
      continue;
    }
    if (row.periodType === "yearly" && (!firstFutureYear || row.startDate < firstFutureYear.startDate)) {
      firstFutureYear = row;
    }
  }
  if (firstFutureYear) visibleById.set(firstFutureYear.id, firstFutureYear);

  for (const [parentType, childType] of SYSTEM_OKR_PERIOD_HIERARCHY) {
    const visibleParents = Array.from(visibleById.values())
      .filter((row) => row.periodType === parentType);
    for (const row of rows) {
      if (row.periodType === childType && visibleParents.some((parent) => systemOkrCycleContains(parent, row))) {
        visibleById.set(row.id, row);
      }
    }
  }
  return Array.from(visibleById.values());
}

const SYSTEM_OKR_PERIOD_HIERARCHY = [
  ["yearly", "half_year"],
  ["half_year", "quarterly"],
  ["quarterly", "monthly"],
] as const;

export function systemOkrCycleContains(parent: SystemOkrCycleWindow, child: SystemOkrCycleWindow) {
  return parent.startDate <= child.startDate && parent.endDate >= child.endDate;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
