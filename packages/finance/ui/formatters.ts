export function formatFinanceAmount(value: number | null | undefined): string {
  const amount = value ?? 0;
  if (Math.round(Math.abs(amount) * 100) === 0) return "0";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCompactNullableAmount(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function formatFinanceDateTime(value: string | Date | null | undefined, businessTimeZone: string): string {
  if (value == null) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}
