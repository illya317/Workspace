export const COMPLETED_STATUS = "done" as const;

export type CompletionScheduleInput = {
  status?: string | null;
  plannedStartDate?: Date | string | null;
  plannedEndDate?: Date | string | null;
  actualStartDate?: Date | string | null;
  actualEndDate?: Date | string | null;
  today?: Date | string;
};

export function isCompletedStatus(status: string | null | undefined) {
  return status === COMPLETED_STATUS;
}

export function canEditActualEndDate(status: string | null | undefined, disabled = false) {
  return !disabled && isCompletedStatus(status);
}

export function actualEndDateForStatus<T>(status: string | null | undefined, actualEndDate: T | null) {
  return isCompletedStatus(status) ? actualEndDate : null;
}

export function todayDateString(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isActualDateAfterToday(value: Date | string | null | undefined, today: Date | string = new Date()) {
  const valueKey = dateKey(value);
  const todayKey = dateKey(today) ?? todayDateString();
  return Boolean(valueKey && valueKey > todayKey);
}

export function validateCompletionSchedule(input: CompletionScheduleInput) {
  if (isActualDateAfterToday(input.actualStartDate, input.today)) return "实际开始不能晚于今日";
  if (isActualDateAfterToday(input.actualEndDate, input.today)) return "实际结束不能晚于今日";
  if (input.actualEndDate && !isCompletedStatus(input.status)) return "请先选择已完成，再填写实际结束";
  if (isAfter(input.plannedStartDate, input.plannedEndDate)) return "计划结束不能早于计划开始";
  if (isAfter(input.actualStartDate, input.actualEndDate)) return "实际结束不能早于实际开始";
  return null;
}

function isAfter(start: Date | string | null | undefined, end: Date | string | null | undefined) {
  const startKey = dateKey(start);
  const endKey = dateKey(end);
  return Boolean(startKey && endKey && endKey < startKey);
}

function dateKey(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : todayDateString(value);
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}
