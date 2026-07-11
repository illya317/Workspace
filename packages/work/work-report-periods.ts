const WORK_REPORT_WEEK_ANCHOR = "2026-07-06";
const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeWorkReportWeekStart(value: string | null | undefined, fallbackDate = WORK_REPORT_WEEK_ANCHOR) {
  const candidate = validDate(value) ?? validDate(fallbackDate) ?? WORK_REPORT_WEEK_ANCHOR;
  if (candidate <= WORK_REPORT_WEEK_ANCHOR) return WORK_REPORT_WEEK_ANCHOR;
  const elapsedDays = Math.floor((parseDate(candidate).getTime() - parseDate(WORK_REPORT_WEEK_ANCHOR).getTime()) / DAY_MS);
  return addDays(WORK_REPORT_WEEK_ANCHOR, Math.floor(elapsedDays / 7) * 7);
}

export function listWorkReportWeekStarts(today: string) {
  const lastStart = addDays(normalizeWorkReportWeekStart(today), 7);
  const starts: string[] = [];
  for (let start = WORK_REPORT_WEEK_ANCHOR; start <= lastStart; start = addDays(start, 7)) starts.push(start);
  return starts.sort((left, right) => right.localeCompare(left));
}

function validDate(value: string | null | undefined) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
