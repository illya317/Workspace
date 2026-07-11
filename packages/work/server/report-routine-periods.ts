type ReportPeriod = { startDate: Date; endDate: Date };

type RoutineReportTask = {
  routineTaskType: string | null;
  routineRecurrenceType: string | null;
  routineRecurrenceWeekday: number | null;
  routineRecurrenceMonthDay: number | null;
  routineRecurrenceQuarterDay: number | null;
  routineRecurrenceYearMonth: number | null;
  routineRecurrenceYearDay: number | null;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
};

export function routineTaskVisibleInPeriod(item: RoutineReportTask, period: ReportPeriod) {
  const type = normalizeRoutineTaskType(item.routineTaskType);
  if (type === "standing") return true;
  if (item.routineRecurrenceType) return recurrenceMatchesPeriod(item, period);
  return taskWindowOverlapsPeriod(item.actualStartDate, item.actualEndDate, period);
}

function recurrenceMatchesPeriod(item: RoutineReportTask, period: ReportPeriod) {
  const recurrenceType = normalizeRoutineRecurrenceType(item.routineRecurrenceType);
  if (recurrenceType === "daily") return true;
  if (recurrenceType === "weekly") return weeklyRecurrenceMatchesPeriod(item.routineRecurrenceWeekday || 1, period);
  if (recurrenceType === "monthly") return monthlyRecurrenceMatchesPeriod(item.routineRecurrenceMonthDay || 1, period);
  if (recurrenceType === "quarterly") return quarterlyRecurrenceMatchesPeriod(item.routineRecurrenceQuarterDay || 1, period);
  return yearlyRecurrenceMatchesPeriod(item.routineRecurrenceYearMonth || 1, item.routineRecurrenceYearDay || 1, period);
}

function normalizeRoutineTaskType(value: string | null) {
  return value === "standing" ? "standing" : "task";
}

function normalizeRoutineRecurrenceType(value: string | null) {
  if (value === "weekly" || value === "monthly" || value === "quarterly" || value === "yearly") return value;
  return "daily";
}

function weeklyRecurrenceMatchesPeriod(weekday: number, period: ReportPeriod) {
  const normalizedWeekday = clampInteger(weekday, 1, 7);
  for (let cursor = dateOnly(period.startDate); cursor <= dateOnly(period.endDate); cursor = addDays(cursor, 1)) {
    if ((cursor.getUTCDay() || 7) === normalizedWeekday) return true;
  }
  return false;
}

function monthlyRecurrenceMatchesPeriod(monthDay: number, period: ReportPeriod) {
  const start = dateOnly(period.startDate);
  const end = dateOnly(period.endDate);
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    const startMonth = year === start.getUTCFullYear() ? start.getUTCMonth() : 0;
    const endMonth = year === end.getUTCFullYear() ? end.getUTCMonth() : 11;
    for (let month = startMonth; month <= endMonth; month += 1) {
      const day = Math.min(clampInteger(monthDay, 1, 31), daysInMonth(year, month));
      if (dateInReportPeriod(new Date(Date.UTC(year, month, day)), period)) return true;
    }
  }
  return false;
}

function quarterlyRecurrenceMatchesPeriod(quarterDay: number, period: ReportPeriod) {
  const start = dateOnly(period.startDate);
  const end = dateOnly(period.endDate);
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    for (const quarterStartMonth of [0, 3, 6, 9]) {
      const quarterStart = new Date(Date.UTC(year, quarterStartMonth, 1));
      const nextQuarterStart = quarterStartMonth === 9 ? new Date(Date.UTC(year + 1, 0, 1)) : new Date(Date.UTC(year, quarterStartMonth + 3, 1));
      if (quarterStart > end || addDays(nextQuarterStart, -1) < start) continue;
      const quarterLength = Math.round((nextQuarterStart.getTime() - quarterStart.getTime()) / 86400000);
      const dayOffset = Math.min(clampInteger(quarterDay, 1, 92), quarterLength) - 1;
      if (dateInReportPeriod(addDays(quarterStart, dayOffset), period)) return true;
    }
  }
  return false;
}

function yearlyRecurrenceMatchesPeriod(month: number, day: number, period: ReportPeriod) {
  const start = dateOnly(period.startDate);
  const end = dateOnly(period.endDate);
  const normalizedMonth = clampInteger(month, 1, 12) - 1;
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    const normalizedDay = Math.min(clampInteger(day, 1, 31), daysInMonth(year, normalizedMonth));
    if (dateInReportPeriod(new Date(Date.UTC(year, normalizedMonth, normalizedDay)), period)) return true;
  }
  return false;
}

function dateInReportPeriod(value: Date, period: ReportPeriod) {
  return value >= dateOnly(period.startDate) && value <= dateOnly(period.endDate);
}

function dateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isInteger(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function taskWindowOverlapsPeriod(actualStartDate: Date | null, actualEndDate: Date | null, period: ReportPeriod) {
  if (actualStartDate && actualStartDate > period.endDate) return false;
  if (actualEndDate && actualEndDate < period.startDate) return false;
  return true;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
