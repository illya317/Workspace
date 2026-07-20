function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeTimePart(value: number, max: number) {
  return pad2(Math.min(max, Math.max(0, value)));
}

export function parseTimeValue(value: string | null | undefined) {
  const match = value?.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return { hour: "", minute: "" };
  return {
    hour: normalizeTimePart(Number(match[1]), 23),
    minute: normalizeTimePart(Number(match[2]), 59),
  };
}

export function normalizeTimeTextPart(value: string, max: number) {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  return String(Math.min(max, Number(digits)));
}

export function composeTimeValue(hour: string, minute: string) {
  if (!hour && !minute) return null;
  return `${normalizeTimePart(Number(hour || 0), 23)}:${normalizeTimePart(Number(minute || 0), 59)}`;
}

export type TimePartName = "hour" | "minute";

export interface TimeParts {
  hour: string;
  minute: string;
}

export function updateTimeDraftPart(
  current: TimeParts,
  part: TimePartName,
  nextPartValue: string,
) {
  const draft = { ...current, [part]: nextPartValue };
  return {
    draft,
    value: composeTimeValue(draft.hour, draft.minute),
  };
}
