function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDate(year: number, monthIndex: number, day: number) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

export function formatMonth(year: number, monthIndex: number) {
  return `${year}-${pad2(monthIndex + 1)}`;
}

export function formatQuarter(year: number, quarter: number) {
  return `${year}-Q${quarter}`;
}

export function formatWeek(year: number, monthIndex: number, day: number) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${isoYear}-W${pad2(week)}`;
}

export function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex || parsed.getDate() !== day) return null;
  return { year, monthIndex, day };
}

export function parseMonth(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex, day: 1 };
}

export function parseQuarter(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  if (!Number.isInteger(year)) return null;
  return { year, monthIndex: (quarter - 1) * 3, day: 1 };
}

export function parseWeek(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isInteger(isoYear) || week < 1 || week > 53) return null;
  const januaryFourth = new Date(Date.UTC(isoYear, 0, 4));
  const januaryFourthWeekday = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - januaryFourthWeekday + 1 + (week - 1) * 7);
  if (formatWeek(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()) !== value) return null;
  return { year: monday.getUTCFullYear(), monthIndex: monday.getUTCMonth(), day: monday.getUTCDate() };
}

export function parseYear(value: string | null | undefined) {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  if (!Number.isInteger(year)) return null;
  return { year, monthIndex: 0, day: 1 };
}
