import { getTenantProfile } from "./tenant-config";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

export function workspaceBusinessTimeZone() {
  return getTenantProfile().localization.businessTimeZone;
}

function dateFormatter(timeZone: string) {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function dateTimeFormatter(timeZone: string) {
  let formatter = dateTimeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dateTimeFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function partNumber(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return Number(parts.find((part) => part.type === type)?.value ?? 0);
}

function offsetAt(instant: Date, timeZone: string) {
  const parts = dateTimeFormatter(timeZone).formatToParts(instant);
  const representedAsUtc = Date.UTC(
    partNumber(parts, "year"),
    partNumber(parts, "month") - 1,
    partNumber(parts, "day"),
    partNumber(parts, "hour"),
    partNumber(parts, "minute"),
    partNumber(parts, "second"),
  );
  return representedAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function workspaceBusinessDate(value: Date) {
  const parts = dateFormatter(workspaceBusinessTimeZone()).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value ?? ""
  );
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function workspaceBusinessDayStart(value: Date) {
  const timeZone = workspaceBusinessTimeZone();
  const [year, month, day] = workspaceBusinessDate(value).split("-").map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day);
  const firstGuess = new Date(wallClockUtc - offsetAt(new Date(wallClockUtc), timeZone));
  return new Date(wallClockUtc - offsetAt(firstGuess, timeZone));
}
