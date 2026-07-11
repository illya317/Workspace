import { CHINA_HOLIDAY_YEAR_DEFINITIONS } from "./data";
import type {
  CalendarDateRange,
  ChinaCalendarDay,
  ChinaCalendarRange,
  ChinaHolidayRange,
  ChinaHolidaySource,
  WorkdayCalendarOptions,
} from "./types";
export type {
  CalendarDateRange,
  ChinaAdjustedWorkday,
  ChinaCalendarDateKind,
  ChinaCalendarDay,
  ChinaCalendarRange,
  ChinaHolidayKey,
  ChinaHolidayRange,
  ChinaHolidaySource,
  ChinaHolidayYearDefinition,
  WorkdayCalendarMode,
  WorkdayCalendarOptions,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ChinaCalendarOverride = Pick<ChinaCalendarDay, "date" | "kind" | "holidayKey" | "holidayName" | "source">;

const sourceByYear = new Map<number, ChinaHolidaySource>(
  CHINA_HOLIDAY_YEAR_DEFINITIONS.map((definition) => [definition.year, definition.source]),
);
const overrideByDate = buildOverrideIndex();

export const CHINA_HOLIDAY_AVAILABLE_YEARS = CHINA_HOLIDAY_YEAR_DEFINITIONS.map((definition) => definition.year);

export function getSupportedChinaHolidayYears() {
  return [...CHINA_HOLIDAY_AVAILABLE_YEARS];
}

export function getChinaHolidaySource(year: number): ChinaHolidaySource | undefined {
  return sourceByYear.get(year);
}

export function getChinaCalendarDay(input: string | Date): ChinaCalendarDay {
  const date = normalizeChinaCalendarDate(input);
  const override = overrideByDate.get(date);
  const isWeekend = isWeekendDate(date);

  if (override?.kind === "holiday") {
    return {
      ...override,
      isWorkday: false,
      isWeekend,
      isHoliday: true,
      isAdjustedWorkday: false,
    };
  }

  if (override?.kind === "adjusted-workday") {
    return {
      ...override,
      isWorkday: true,
      isWeekend,
      isHoliday: false,
      isAdjustedWorkday: true,
    };
  }

  return {
    date,
    kind: isWeekend ? "weekend" : "workday",
    isWorkday: !isWeekend,
    isWeekend,
    isHoliday: false,
    isAdjustedWorkday: false,
  };
}

export function listChinaCalendarDays(range: ChinaCalendarRange): ChinaCalendarDay[] {
  const startDate = normalizeChinaCalendarDate(range.startDate);
  const endDate = normalizeChinaCalendarDate(range.endDate);
  if (compareDateKeys(startDate, endDate) > 0) return [];

  const days: ChinaCalendarDay[] = [];
  for (let date = startDate; compareDateKeys(date, endDate) <= 0; date = addDays(date, 1)) {
    days.push(getChinaCalendarDay(date));
  }
  return days;
}

export function countWorkdays(range: CalendarDateRange, options: WorkdayCalendarOptions = {}) {
  const startDate = normalizeChinaCalendarDate(range.startDate);
  const endDate = normalizeChinaCalendarDate(range.endDate);
  if (compareDateKeys(startDate, endDate) > 0) return 0;

  let count = 0;
  for (let date = startDate; compareDateKeys(date, endDate) <= 0; date = addDays(date, 1)) {
    if (isWorkdayByMode(date, options)) count += 1;
  }
  return count;
}

export function countWorkdayOverlap(
  left: CalendarDateRange,
  right: CalendarDateRange,
  options: WorkdayCalendarOptions = {},
) {
  const startDate = maxDateKey(
    normalizeChinaCalendarDate(left.startDate),
    normalizeChinaCalendarDate(right.startDate),
  );
  const endDate = minDateKey(
    normalizeChinaCalendarDate(left.endDate),
    normalizeChinaCalendarDate(right.endDate),
  );
  if (compareDateKeys(startDate, endDate) > 0) return 0;
  return countWorkdays({ startDate, endDate }, options);
}

export function hasWorkdayOverlap(
  left: CalendarDateRange,
  right: CalendarDateRange,
  options: WorkdayCalendarOptions = {},
) {
  return countWorkdayOverlap(left, right, options) > 0;
}

export function isChinaWorkday(input: string | Date) {
  return getChinaCalendarDay(input).isWorkday;
}

export function isChinaRestDay(input: string | Date) {
  return !isChinaWorkday(input);
}

export function isChinaHoliday(input: string | Date) {
  return getChinaCalendarDay(input).isHoliday;
}

export function isChinaAdjustedWorkday(input: string | Date) {
  return getChinaCalendarDay(input).isAdjustedWorkday;
}

export function addChinaWorkdays(input: string | Date, amount: number) {
  const step = amount < 0 ? -1 : 1;
  let remaining = Math.abs(amount);
  let date = normalizeChinaCalendarDate(input);

  while (remaining > 0) {
    date = addDays(date, step);
    if (isChinaWorkday(date)) remaining -= 1;
  }
  return date;
}

export function nextChinaWorkday(input: string | Date) {
  return addChinaWorkdays(input, 1);
}

export function previousChinaWorkday(input: string | Date) {
  return addChinaWorkdays(input, -1);
}

export function normalizeChinaCalendarDate(input: string | Date) {
  if (typeof input === "string") {
    if (!DATE_KEY_PATTERN.test(input) || !isValidDateKey(input)) throw new Error(`Invalid calendar date: ${input}`);
    return input;
  }
  if (Number.isNaN(input.getTime())) throw new Error("Invalid calendar date");
  return toDateKey(input.getFullYear(), input.getMonth() + 1, input.getDate());
}

export function normalizeCalendarDate(input: string | Date) {
  return normalizeChinaCalendarDate(input);
}

function buildOverrideIndex() {
  const index = new Map<string, ChinaCalendarOverride>();

  for (const definition of CHINA_HOLIDAY_YEAR_DEFINITIONS) {
    for (const range of definition.holidayRanges) {
      for (const date of expandRange(range)) {
        setOverride(index, {
          date,
          kind: "holiday",
          holidayKey: range.holidayKey,
          holidayName: range.holidayName,
          source: definition.source,
        });
      }
    }

    for (const workday of definition.adjustedWorkdays) {
      setOverride(index, {
        date: workday.date,
        kind: "adjusted-workday",
        holidayKey: workday.holidayKey,
        holidayName: workday.holidayName,
        source: definition.source,
      });
    }
  }
  return index;
}

function setOverride(index: Map<string, ChinaCalendarOverride>, entry: ChinaCalendarOverride) {
  const current = index.get(entry.date);
  if (current) throw new Error(`Duplicate China calendar override for ${entry.date}: ${current.kind} and ${entry.kind}`);
  index.set(entry.date, entry);
}

function expandRange(range: ChinaHolidayRange) {
  const dates: string[] = [];
  for (let date = range.startDate; compareDateKeys(date, range.endDate) <= 0; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function isWeekendDate(date: string) {
  const day = parseDateKeyToUtcDate(date).getUTCDay();
  return day === 0 || day === 6;
}

function compareDateKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function maxDateKey(left: string, right: string) {
  return compareDateKeys(left, right) >= 0 ? left : right;
}

function minDateKey(left: string, right: string) {
  return compareDateKeys(left, right) <= 0 ? left : right;
}

function addDays(date: string, amount: number) {
  const next = new Date(parseDateKeyToUtcDate(date).getTime() + amount * DAY_MS);
  return toDateKey(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function isValidDateKey(date: string) {
  const parsed = parseDateKeyToUtcDate(date);
  return date === toDateKey(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

function isWorkdayByMode(date: string, options: WorkdayCalendarOptions) {
  if (options.mode === "weekday") return !isWeekendDate(date);
  return getChinaCalendarDay(date).isWorkday;
}

function parseDateKeyToUtcDate(date: string) {
  const [year = "", month = "", day = ""] = date.split("-");
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
