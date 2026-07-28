import {
  isStatementPeriodEnd,
  type StatementPeriodKind,
} from "@workspace/finance/types/statement-period";

type CounterpartyPeriodScopeResult =
  | { ok: true; data: { year: number; month: number; periodKind: StatementPeriodKind } }
  | { ok: false; error: string };

export function parseCounterpartyPeriodKind(value: unknown): StatementPeriodKind | null {
  if (value === undefined || value === "month") return "month";
  return value === "year" || value === "quarter" ? value : null;
}

export function counterpartyPeriodScope(
  input: Readonly<Record<string, string | number | boolean>>,
): CounterpartyPeriodScopeResult {
  if (typeof input.year !== "number" || !Number.isInteger(input.year)) return { ok: false, error: "year 为必填参数" };
  if (typeof input.month !== "number" || !Number.isInteger(input.month)) return { ok: false, error: "month 为必填参数" };
  const periodKind = parseCounterpartyPeriodKind(input.periodKind);
  if (!periodKind) return { ok: false, error: "periodKind 仅支持 year、quarter 或 month" };
  const validationError = counterpartyPeriodValidationMessage(input.year, input.month, periodKind);
  return validationError
    ? { ok: false, error: validationError }
    : { ok: true, data: { year: input.year, month: input.month, periodKind } };
}

export function counterpartyPeriodValidationMessage(
  year: number,
  month: number,
  periodKind: StatementPeriodKind,
) {
  if (isStatementPeriodEnd({ year, month }, periodKind)) return null;
  return periodKind === "year" ? "年度必须选择12月作为期末" : "季度必须选择季度末月份";
}

export function counterpartyPeriodLabel(year: number, month: number, periodKind: StatementPeriodKind) {
  if (periodKind === "year") return `${year}年度`;
  if (periodKind === "quarter") return `${year}年第${Math.ceil(month / 3)}季度`;
  return `${year}.${String(month).padStart(2, "0")}`;
}
