export function getCurrentWeekInfo() {
  const now = new Date();
  const year = now.getFullYear();

  const startOfYear = new Date(year, 0, 1);
  const dayOfWeek = startOfYear.getDay() || 7;
  const firstMonday = new Date(year, 0, 1 + (8 - dayOfWeek) % 7);

  if (now < firstMonday) {
    const prevYear = year - 1;
    const prevStart = new Date(prevYear, 0, 1);
    const prevDayOfWeek = prevStart.getDay() || 7;
    const prevFirstMonday = new Date(prevYear, 0, 1 + (8 - prevDayOfWeek) % 7);
    const prevEndOfYear = new Date(year, 0, 0);
    const weekNumber =
      Math.floor((prevEndOfYear.getTime() - prevFirstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const prevWeekStart = prevFirstMonday;
    const prevWeekEnd = new Date(prevWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    return {
      year: prevYear,
      weekNumber,
      weekStart: prevWeekStart,
      weekEnd: prevWeekEnd,
      firstMonday: prevFirstMonday,
      label: `${prevYear} 年第 ${weekNumber} 周`,
      dateRange: `${formatDate(prevWeekStart)} - ${formatDate(prevWeekEnd)}`,
    };
  }

  const weekNumber =
    Math.floor((now.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

  const weekStart = new Date(firstMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

  return {
    year,
    weekNumber,
    weekStart,
    weekEnd,
    label: `${year} 年第 ${weekNumber} 周`,
    dateRange: `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
  };
}

export function getWeekRange(year: number, weekNumber: number) {
  const startOfYear = new Date(year, 0, 1);
  const dayOfWeek = startOfYear.getDay() || 7;
  const firstMonday = new Date(year, 0, 1 + (8 - dayOfWeek) % 7);

  const weekStart = new Date(firstMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

  return {
    weekStart,
    weekEnd,
    label: `${year} 年第 ${weekNumber} 周`,
    dateRange: `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
  };
}

function formatDate(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
