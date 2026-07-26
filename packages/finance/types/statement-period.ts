export interface StatementPeriodEndInput {
  year: number;
  month: number;
  endDate?: string | null;
}

export const STATEMENT_PERIOD_KINDS = ["year", "quarter", "month"] as const;

export type StatementPeriodKind = typeof STATEMENT_PERIOD_KINDS[number];

export interface StatementPeriodPoint {
  year: number;
  month: number;
}

export const BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL = "上年年末余额";
export const BALANCE_SHEET_CURRENT_AMOUNT_LABEL = "期末余额";
export const FLOW_STATEMENT_CURRENT_AMOUNT_LABEL = "本期金额";
export const FLOW_STATEMENT_COMPARATIVE_AMOUNT_LABEL = "上期金额";

export function balanceSheetOpeningPoint(
  period: StatementPeriodPoint,
): StatementPeriodPoint {
  return { year: period.year, month: 1 };
}

export function balanceSheetOpeningReclassPoint(
  period: StatementPeriodPoint,
): StatementPeriodPoint {
  return { year: period.year - 1, month: 12 };
}

export function isStatementPeriodEnd(
  period: StatementPeriodPoint,
  kind: StatementPeriodKind,
) {
  if (kind === "year") return period.month === 12;
  if (kind === "quarter") return period.month % 3 === 0;
  return period.month >= 1 && period.month <= 12;
}

export function formatStatementPeriodEndLabel(input: StatementPeriodEndInput) {
  const explicit = parseIsoDate(input.endDate);
  if (explicit) {
    return `${explicit.year}年${explicit.month}月${explicit.day}日`;
  }

  const day = new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
  return `${input.year}年${input.month}月${day}日`;
}

function parseIsoDate(value: string | null | undefined) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}
