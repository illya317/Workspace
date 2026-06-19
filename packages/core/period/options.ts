import type { PeriodInfo, PeriodType } from "./types";
import { getPeriodRange } from "./core";

export function getPreviousPeriod(periodType: PeriodType, year: number, periodIndex: number): PeriodInfo {
  if (periodType === "daily") {
    const d = new Date(year, 0, 1);
    d.setDate(d.getDate() + periodIndex - 2);
    const prevYear = d.getFullYear();
    const startOfYear = new Date(prevYear, 0, 1);
    const prevDayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    return getPeriodRange("daily", prevYear, prevDayOfYear);
  }
  if (periodType === "weekly") {
    const prevWeek = periodIndex - 1;
    if (prevWeek < 1) {
      const prevYear = year - 1;
      const prevJan1 = new Date(prevYear, 0, 1);
      const prevDayOfWeek = prevJan1.getDay() || 7;
      const prevFirstMonday = new Date(prevYear, 0, 1 + (8 - prevDayOfWeek) % 7);
      const prevYearEnd = new Date(year, 0, 0);
      const lastWeek = Math.floor((prevYearEnd.getTime() - prevFirstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
      return getPeriodRange("weekly", prevYear, lastWeek);
    }
    return getPeriodRange("weekly", year, prevWeek);
  }
  if (periodType === "monthly") {
    const prevMonth = periodIndex - 1;
    if (prevMonth < 1) return getPeriodRange("monthly", year - 1, 12);
    return getPeriodRange("monthly", year, prevMonth);
  }
  if (periodType === "quarterly") {
    const prevQuarter = periodIndex - 1;
    if (prevQuarter < 1) return getPeriodRange("quarterly", year - 1, 4);
    return getPeriodRange("quarterly", year, prevQuarter);
  }
  return getPeriodRange("yearly", year - 1, 1);
}

export function getPeriodTypeName(periodType: PeriodType): string {
  const names: Record<PeriodType, string> = {
    daily: "日报",
    weekly: "周报",
    monthly: "月报",
    quarterly: "季报",
    yearly: "年报",
  };
  return names[periodType];
}

export function getPeriodOptions(periodType: PeriodType, year: number): Array<{ value: number; label: string }> {
  if (periodType === "daily") {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const days = isLeap ? 366 : 365;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(year, 0, 1);
      d.setDate(d.getDate() + i);
      return { value: i + 1, label: `${d.getMonth() + 1}月${d.getDate()}日` };
    });
  }
  if (periodType === "weekly") {
    const jan1 = new Date(year, 0, 1);
    const dayOfWeek = jan1.getDay() || 7;
    const firstMonday = new Date(year, 0, 1 + (8 - dayOfWeek) % 7);
    const yearEnd = new Date(year, 11, 31);
    const weeks = Math.floor((yearEnd.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    return Array.from({ length: weeks }, (_, i) => {
      const ws = new Date(firstMonday.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const we = new Date(ws.getTime() + 6 * 24 * 60 * 60 * 1000);
      return { value: i + 1, label: `第${i + 1}周 (${formatDate(ws)}-${formatDate(we)})` };
    });
  }
  if (periodType === "monthly") {
    return Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}月` }));
  }
  if (periodType === "quarterly") {
    return [
      { value: 1, label: "第一季度 (1-3月)" },
      { value: 2, label: "第二季度 (4-6月)" },
      { value: 3, label: "第三季度 (7-9月)" },
      { value: 4, label: "第四季度 (10-12月)" },
    ];
  }
  return [{ value: 1, label: `${year}年` }];
}

export function getYearOptions(periodType: PeriodType, currentYear: number): number[] {
  if (periodType === "yearly") {
    return Array.from({ length: 5 }, (_, i) => currentYear - i);
  }
  return [currentYear];
}

function formatDate(d: Date) {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
