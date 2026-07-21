export type ConsolidationPeriodKind = "year" | "quarter" | "month";

export function consolidationPeriodValue(year: number, month: number, kind: ConsolidationPeriodKind) {
  if (kind === "year") return String(year);
  if (kind === "quarter") return `${year}-Q${Math.ceil(month / 3)}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function consolidationPeriodLabel(year: number, month: number, kind: ConsolidationPeriodKind) {
  if (kind === "year") return `${year}年`;
  if (kind === "quarter") return `${year}年第${Math.ceil(month / 3)}季度`;
  return `${year}年${month}月`;
}

export function parseConsolidationPeriod(value: string, kind: ConsolidationPeriodKind) {
  if (kind === "year") return /^\d{4}$/.test(value) ? { year: Number(value), month: 12 } : null;
  if (kind === "quarter") {
    const match = /^(\d{4})-Q([1-4])$/.exec(value);
    return match ? { year: Number(match[1]), month: Number(match[2]) * 3 } : null;
  }
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const selectedMonth = match ? Number(match[2]) : 0;
  return match && selectedMonth >= 1 && selectedMonth <= 12
    ? { year: Number(match[1]), month: selectedMonth }
    : null;
}

export function shiftConsolidationPeriod(year: number, month: number, kind: ConsolidationPeriodKind, delta: number) {
  const monthDelta = kind === "year" ? 12 : kind === "quarter" ? 3 : 1;
  const next = new Date(year, month - 1 + monthDelta * delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() + 1 };
}
