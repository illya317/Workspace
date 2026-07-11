export type DatedPeriodOption = {
  startDate: string;
};

export function selectVisiblePeriods<T extends DatedPeriodOption>(
  periods: T[],
  options: { today: string; futureMonths?: number },
) {
  const futureBoundary = addMonths(options.today, options.futureMonths ?? 1);
  const currentAndPast = periods.filter((period) => period.startDate <= options.today);
  const nextPeriod = periods
    .filter((period) => period.startDate > options.today && period.startDate <= futureBoundary)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  return [
    ...(nextPeriod ? [nextPeriod] : []),
    ...currentAndPast,
  ].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

function addMonths(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}
