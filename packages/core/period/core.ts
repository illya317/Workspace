import type { PeriodInfo, PeriodType } from "./types";

function formatDate(d: Date) {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function getMondayOfWeek(year: number, weekNumber: number): Date {
  const jan1 = new Date(year, 0, 1);
  const dayOfWeek = jan1.getDay() || 7;
  const firstMonday = new Date(year, 0, 1 + (8 - dayOfWeek) % 7);
  return new Date(firstMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
}

export function getCurrentPeriod(periodType: PeriodType): PeriodInfo {
  if (periodType === "daily") return getCurrentDay();
  if (periodType === "weekly") return getCurrentWeek();
  if (periodType === "monthly") return getCurrentMonth();
  if (periodType === "quarterly") return getCurrentQuarter();
  return getCurrentYear();
}

function getCurrentDay(): PeriodInfo {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return {
    year,
    periodIndex: dayOfYear,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    label: `${year}年${month}月${day}日`,
    dateRange: `${month}月${day}日`,
  };
}

export function getCurrentWeek(): PeriodInfo {
  const now = new Date();
  const year = now.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const dayOfWeek = jan1.getDay() || 7;
  const firstMonday = new Date(year, 0, 1 + (8 - dayOfWeek) % 7);

  if (now < firstMonday) {
    const prevYear = year - 1;
    const prevJan1 = new Date(prevYear, 0, 1);
    const prevDayOfWeek = prevJan1.getDay() || 7;
    const prevFirstMonday = new Date(prevYear, 0, 1 + (8 - prevDayOfWeek) % 7);
    const prevYearEnd = new Date(year, 0, 0);
    const weekNumber = Math.floor((prevYearEnd.getTime() - prevFirstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const weekStart = new Date(prevFirstMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    return {
      year: prevYear,
      periodIndex: weekNumber,
      date: weekStart.toISOString().slice(0, 10),
      label: `${prevYear}年第${weekNumber}周`,
      dateRange: `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
    };
  }

  const weekNumber = Math.floor((now.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  const weekStart = new Date(firstMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  return {
    year,
    periodIndex: weekNumber,
    date: weekStart.toISOString().slice(0, 10),
    label: `${year}年第${weekNumber}周`,
    dateRange: `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
  };
}

function getCurrentMonth(): PeriodInfo {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    year,
    periodIndex: month,
    date: `${year}-${String(month).padStart(2, "0")}-01`,
    label: `${year}年${month}月`,
    dateRange: `${month}月1日 - ${month}月${lastDay}日`,
  };
}

function getCurrentQuarter(): PeriodInfo {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  const qStartMonth = (quarter - 1) * 3 + 1;
  const qEndMonth = qStartMonth + 2;
  const lastDay = new Date(year, qEndMonth, 0).getDate();
  return {
    year,
    periodIndex: quarter,
    date: `${year}-${String(qStartMonth).padStart(2, "0")}-01`,
    label: `${year}年第${quarter}季度`,
    dateRange: `${qStartMonth}月1日 - ${qEndMonth}月${lastDay}日`,
  };
}

function getCurrentYear(): PeriodInfo {
  const year = new Date().getFullYear();
  return {
    year,
    periodIndex: 1,
    date: `${year}-01-01`,
    label: `${year}年`,
    dateRange: `1月1日 - 12月31日`,
  };
}

export function getPeriodRange(periodType: PeriodType, year: number, periodIndex: number): PeriodInfo {
  if (periodType === "daily") return getDayRange(year, periodIndex);
  if (periodType === "weekly") return getWeekRange(year, periodIndex);
  if (periodType === "monthly") return getMonthRange(year, periodIndex);
  if (periodType === "quarterly") return getQuarterRange(year, periodIndex);
  return getYearRange(year);
}

function getDayRange(year: number, dayOfYear: number): PeriodInfo {
  const start = new Date(year, 0, 1);
  start.setDate(start.getDate() + dayOfYear - 1);
  const m = start.getMonth() + 1;
  const d = start.getDate();
  return {
    year,
    periodIndex: dayOfYear,
    date: start.toISOString().slice(0, 10),
    label: `${year}年${m}月${d}日`,
    dateRange: `${m}月${d}日`,
  };
}

function getWeekRange(year: number, weekNumber: number): PeriodInfo {
  const weekStart = getMondayOfWeek(year, weekNumber);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  return {
    year,
    periodIndex: weekNumber,
    date: weekStart.toISOString().slice(0, 10),
    label: `${year}年第${weekNumber}周`,
    dateRange: `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
  };
}

function getMonthRange(year: number, month: number): PeriodInfo {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    year,
    periodIndex: month,
    date: `${year}-${String(month).padStart(2, "0")}-01`,
    label: `${year}年${month}月`,
    dateRange: `${month}月1日 - ${month}月${lastDay}日`,
  };
}

function getQuarterRange(year: number, quarter: number): PeriodInfo {
  const qStartMonth = (quarter - 1) * 3 + 1;
  const qEndMonth = qStartMonth + 2;
  const lastDay = new Date(year, qEndMonth, 0).getDate();
  return {
    year,
    periodIndex: quarter,
    date: `${year}-${String(qStartMonth).padStart(2, "0")}-01`,
    label: `${year}年第${quarter}季度`,
    dateRange: `${qStartMonth}月1日 - ${qEndMonth}月${lastDay}日`,
  };
}

function getYearRange(year: number): PeriodInfo {
  return {
    year,
    periodIndex: 1,
    date: `${year}-01-01`,
    label: `${year}年`,
    dateRange: `1月1日 - 12月31日`,
  };
}
