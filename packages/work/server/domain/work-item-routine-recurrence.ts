import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export type WorkItemRoutineRecurrenceInput = {
  routineRecurrenceType?: string | null;
  routineRecurrenceTime?: string | null;
  routineRecurrenceWeekday?: number | null;
  routineRecurrenceMonthDay?: number | null;
  routineRecurrenceQuarterDay?: number | null;
  routineRecurrenceYearMonth?: number | null;
  routineRecurrenceYearDay?: number | null;
};

export const recurrenceFieldNames = [
  "routineRecurrenceType",
  "routineRecurrenceTime",
  "routineRecurrenceWeekday",
  "routineRecurrenceMonthDay",
  "routineRecurrenceQuarterDay",
  "routineRecurrenceYearMonth",
  "routineRecurrenceYearDay",
] as const;

export function normalizeRoutineRecurrenceFields(input: WorkItemRoutineRecurrenceInput, isRecurring: boolean) {
  const time = normalizeRoutineRecurrenceTime(input.routineRecurrenceTime);
  if (!time.ok) return time;
  if (!isRecurring) return okCommand({ ...emptyRoutineRecurrenceFields(), routineRecurrenceTime: time.data });
  const type = normalizeRoutineRecurrenceType(input.routineRecurrenceType);
  if (!type.ok) return type;
  const weekday = normalizeIntegerInRange(input.routineRecurrenceWeekday, 1, "周期星期", 1, 7);
  if (!weekday.ok) return weekday;
  const monthDay = normalizeIntegerInRange(input.routineRecurrenceMonthDay, 1, "每月日期", 1, 31);
  if (!monthDay.ok) return monthDay;
  const quarterDay = normalizeIntegerInRange(input.routineRecurrenceQuarterDay, 1, "季度天数", 1, 92);
  if (!quarterDay.ok) return quarterDay;
  const yearMonth = normalizeIntegerInRange(input.routineRecurrenceYearMonth, 1, "年度月份", 1, 12);
  if (!yearMonth.ok) return yearMonth;
  const yearDay = normalizeIntegerInRange(input.routineRecurrenceYearDay, 1, "年度日期", 1, 31);
  if (!yearDay.ok) return yearDay;
  return okCommand({
    routineRecurrenceType: type.data,
    routineRecurrenceTime: time.data,
    routineRecurrenceWeekday: weekday.data,
    routineRecurrenceMonthDay: monthDay.data,
    routineRecurrenceQuarterDay: quarterDay.data,
    routineRecurrenceYearMonth: yearMonth.data,
    routineRecurrenceYearDay: yearDay.data,
  });
}

export function emptyRoutineRecurrenceFields() {
  return {
    routineRecurrenceType: null,
    routineRecurrenceTime: null,
    routineRecurrenceWeekday: null,
    routineRecurrenceMonthDay: null,
    routineRecurrenceQuarterDay: null,
    routineRecurrenceYearMonth: null,
    routineRecurrenceYearDay: null,
  };
}

function normalizeRoutineRecurrenceType(value: unknown) {
  if (value === null || value === undefined || value === "") return okCommand("daily");
  const type = String(value || "").trim();
  if (type === "daily" || type === "weekly" || type === "monthly" || type === "quarterly" || type === "yearly") return okCommand(type);
  return failCommand("周期规则无效");
}

function normalizeRoutineRecurrenceTime(value: unknown) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const time = String(value || "").trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return okCommand(time);
  return failCommand("周期时间无效");
}

function normalizeIntegerInRange(value: unknown, fallback: number, label: string, min: number, max: number) {
  if (value === null || value === undefined || value === "") return okCommand(fallback);
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return failCommand(`${label}无效`);
  return okCommand(number);
}
