import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface FinanceIdCommand {
  id: number;
}

export interface FinancePeriodScopeCommand {
  companyCode: string;
  year: number;
  month?: number;
}

export function positiveId(value: unknown, field = "id"): DomainValidationResult<number> {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) return failCommand(`${field} must be a positive integer`, 400, field);
  return okCommand(id);
}

export function validYear(value: unknown, field = "year"): DomainValidationResult<number> {
  const year = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2099) return failCommand(`${field} must be 2000..2099`, 400, field);
  return okCommand(year);
}

export function validMonth(value: unknown, field = "month"): DomainValidationResult<number> {
  const month = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return failCommand(`${field} must be 1..12`, 400, field);
  return okCommand(month);
}

export function requiredText(value: unknown, field: string): DomainValidationResult<string> {
  if (typeof value !== "string" || !value.trim()) return failCommand(`${field} is required`, 400, field);
  return okCommand(value.trim());
}

export function finiteNumber(value: unknown, field: string): DomainValidationResult<number> {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return failCommand(`${field} must be a finite number`, 400, field);
  return okCommand(number);
}

export function buildFinanceIdCommand(value: unknown, field = "id"): DomainValidationResult<FinanceIdCommand> {
  const id = positiveId(value, field);
  if (!id.ok) return id;
  return okCommand({ id: id.data });
}

export function buildFinancePeriodScopeCommand(input: {
  companyCode: unknown;
  year: unknown;
  month?: unknown;
}): DomainValidationResult<FinancePeriodScopeCommand> {
  const companyCode = requiredText(input.companyCode, "companyCode");
  if (!companyCode.ok) return companyCode;
  const year = validYear(input.year);
  if (!year.ok) return year;
  if (input.month === undefined) return okCommand({ companyCode: companyCode.data, year: year.data });
  const month = validMonth(input.month);
  if (!month.ok) return month;
  return okCommand({ companyCode: companyCode.data, year: year.data, month: month.data });
}
