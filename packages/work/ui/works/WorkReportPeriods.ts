import type {
  WorkOkrControlCycleOption,
  WorkPeriodType,
} from "./types";
import { selectVisiblePeriods } from "@workspace/core/period";
import { listWorkReportWeekStarts, normalizeWorkReportWeekStart } from "../../work-report-periods";

export type ReportPeriodType = Exclude<WorkPeriodType, "daily">;
const WORK_REPORT_MONTH_ANCHOR = "2026-01-01";

export const REPORT_PERIOD_TYPE_OPTIONS: Array<{ value: ReportPeriodType; label: string }> = [
  { value: "yearly", label: "年" },
  { value: "half_year", label: "半年" },
  { value: "quarterly", label: "季度" },
  { value: "monthly", label: "月" },
  { value: "weekly", label: "周" },
];

export interface WorkReportPeriodRecord {
  key: string;
  periodType: ReportPeriodType;
  periodStart: string;
  periodEnd: string;
  title: string;
  subtitle: string;
  group: string;
  active: boolean;
  current: boolean;
}

export function createReportPeriodRecords(
  cycles: WorkOkrControlCycleOption[],
  periodType: ReportPeriodType,
  periodStart: string,
): WorkReportPeriodRecord[] {
  const today = formatDate(new Date());
  if (periodType === "weekly") return createWeeklyReportPeriodRecords(periodStart, today);
  const futureBoundary = addMonths(today, 1);
  const seen = new Set<string>();
  const visibleCycles = cycles
    .filter((cycle) => cycle.periodType === periodType && isWithinReportHistory(periodType, cycle.startDate));
  const records = selectVisiblePeriods(visibleCycles, { today })
    .flatMap((cycle) => {
      const key = reportPeriodRecordKey(periodType, cycle.startDate);
      if (seen.has(key)) return [];
      seen.add(key);
      return [cycleToPeriodRecord(cycle, periodType, periodStart, today)];
    });
  const activeKey = reportPeriodRecordKey(periodType, normalizeReportPeriodStart(periodType, periodStart));
  if (records.some((record) => record.key === activeKey)) return records;
  if (!isWithinReportHistory(periodType, periodStart)) return records;
  if (!canShowFallbackPeriod(periodType, periodStart, today, futureBoundary)) return records;
  return [fallbackPeriodRecord(periodType, periodStart, periodStart, today), ...records];
}

function isWithinReportHistory(periodType: ReportPeriodType, periodStart: string) {
  return periodType !== "monthly" || normalizeReportPeriodStart(periodType, periodStart) >= WORK_REPORT_MONTH_ANCHOR;
}

function createWeeklyReportPeriodRecords(periodStart: string, today: string) {
  const selectedStart = normalizeReportPeriodStart("weekly", periodStart);
  return listWorkReportWeekStarts(today)
    .map((start) => fallbackPeriodRecord("weekly", start, selectedStart, today));
}

export function reportPeriodRecordKey(periodType: ReportPeriodType, periodStart: string) {
  return `${periodType}:${periodStart}`;
}

export function getCurrentWeekStart() {
  const now = new Date();
  return normalizeWorkReportWeekStart(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`);
}

export function normalizeReportPeriodType(value: unknown): ReportPeriodType {
  const text = String(value || "");
  return text === "monthly" || text === "quarterly" || text === "half_year" || text === "yearly" ? text : "weekly";
}

export function periodStartForSelection(periodType: ReportPeriodType, currentStart: string, cycles: WorkOkrControlCycleOption[]) {
  if (periodType === "weekly") return normalizeWorkReportWeekStart(currentStart || getCurrentWeekStart());
  return findCycleForDate(cycles, periodType, currentStart)?.startDate
    ?? normalizeReportPeriodStart(periodType, currentStart || getCurrentWeekStart());
}

export function findCycleForDate(cycles: WorkOkrControlCycleOption[], periodType: ReportPeriodType, date: string | null) {
  if (!date) return null;
  return cycles.find((cycle) => cycle.periodType === periodType && cycle.startDate <= date && cycle.endDate >= date) ?? null;
}

function canShowFallbackPeriod(
  periodType: ReportPeriodType,
  periodStart: string,
  today: string,
  futureBoundary: string,
) {
  const start = normalizeReportPeriodStart(periodType, periodStart);
  return start <= today || (start <= futureBoundary && start === nextPeriodStart(periodType, today));
}

function nextPeriodStart(periodType: ReportPeriodType, today: string) {
  const currentStart = normalizeReportPeriodStart(periodType, today);
  const date = parseDate(currentStart);
  if (periodType === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else if (periodType === "monthly") date.setUTCMonth(date.getUTCMonth() + 1, 1);
  else if (periodType === "quarterly") date.setUTCMonth(date.getUTCMonth() + 3, 1);
  else if (periodType === "half_year") date.setUTCMonth(date.getUTCMonth() + 6, 1);
  else date.setUTCFullYear(date.getUTCFullYear() + 1, 0, 1);
  return formatDate(date);
}

function cycleToPeriodRecord(
  cycle: WorkOkrControlCycleOption,
  periodType: ReportPeriodType,
  activeStart: string,
  today: string,
): WorkReportPeriodRecord {
  return {
    key: reportPeriodRecordKey(periodType, cycle.startDate),
    periodType,
    periodStart: cycle.startDate,
    periodEnd: cycle.endDate,
    title: cycle.name,
    subtitle: formatReportPeriodRange(cycle.startDate, cycle.endDate),
    group: `${cycle.startDate.slice(0, 4)} 年`,
    active: cycle.startDate === activeStart,
    current: cycle.startDate === normalizeReportPeriodStart(periodType, today),
  };
}

function fallbackPeriodRecord(periodType: ReportPeriodType, periodStart: string, activeStart: string, today: string): WorkReportPeriodRecord {
  const start = normalizeReportPeriodStart(periodType, periodStart);
  const end = periodEndFor(start, periodType);
  return {
    key: reportPeriodRecordKey(periodType, start),
    periodType,
    periodStart: start,
    periodEnd: end,
    title: fallbackPeriodTitle(periodType, start),
    subtitle: formatReportPeriodRange(start, end),
    group: `${start.slice(0, 4)} 年`,
    active: start === normalizeReportPeriodStart(periodType, activeStart),
    current: start === normalizeReportPeriodStart(periodType, today),
  };
}

function fallbackPeriodTitle(periodType: ReportPeriodType, start: string) {
  const date = parseDate(start);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (periodType === "yearly") return `${year} 年`;
  if (periodType === "half_year") return `${year} H${month < 6 ? 1 : 2}`;
  if (periodType === "quarterly") return `${year} Q${Math.floor(month / 3) + 1}`;
  if (periodType === "monthly") return `${year}-${pad2(month + 1)}`;
  return `${start.slice(5)} 周`;
}

function periodEndFor(start: string, periodType: ReportPeriodType) {
  const date = parseDate(start);
  if (periodType === "weekly") date.setUTCDate(date.getUTCDate() + 6);
  else if (periodType === "monthly") date.setUTCMonth(date.getUTCMonth() + 1, 0);
  else if (periodType === "quarterly") date.setUTCMonth(date.getUTCMonth() + 3, 0);
  else if (periodType === "half_year") date.setUTCMonth(date.getUTCMonth() + 6, 0);
  else date.setUTCFullYear(date.getUTCFullYear() + 1, 0, 0);
  return formatDate(date);
}

function formatReportPeriodRange(start: string, end: string) {
  return `${start} - ${end}`;
}

function normalizeReportPeriodStart(periodType: ReportPeriodType, value: string | null) {
  const date = normalizeDateValue(value) ?? getCurrentWeekStart();
  if (periodType === "weekly") return normalizeWorkReportWeekStart(date);
  const parsed = parseDate(date);
  if (periodType === "yearly") return `${parsed.getUTCFullYear()}-01-01`;
  if (periodType === "half_year") return `${parsed.getUTCFullYear()}-${parsed.getUTCMonth() < 6 ? "01" : "07"}-01`;
  if (periodType === "quarterly") return `${parsed.getUTCFullYear()}-${pad2(Math.floor(parsed.getUTCMonth() / 3) * 3 + 1)}-01`;
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-01`;
}

function normalizeDateValue(value: string | null) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addMonths(value: string, amount: number) {
  const date = parseDate(value);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return formatDate(date);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
