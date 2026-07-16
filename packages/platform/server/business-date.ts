const WORKSPACE_BUSINESS_TIME_ZONE = "Asia/Shanghai";
const SHANGHAI_UTC_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1000;

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: WORKSPACE_BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function workspaceBusinessDate(value: Date) {
  const parts = businessDateFormatter.formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value ?? ""
  );
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function workspaceBusinessDayStart(value: Date) {
  const [year, month, day] = workspaceBusinessDate(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - SHANGHAI_UTC_OFFSET_MILLISECONDS);
}
