import type { StatementExchangeRateRefreshInput } from "@workspace/finance/types";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export interface RefreshStatementExchangeRateCommand {
  input: StatementExchangeRateRefreshInput;
  userId: number;
}

export interface VoucherHistoricalInvestmentRateCommand {
  voucherItemId: number;
  voucherDate: string;
  rate: number;
  matchingLabel: string;
  userId: number;
}

export interface MonthlyAverageExchangeRateCommand {
  currencyCode: string;
  year: number;
  month: number;
  userId: number;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function buildRefreshStatementExchangeRateCommand(
  raw: StatementExchangeRateRefreshInput,
  userId: number,
) {
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("当前用户无效", 401);
  const currencyCode = raw.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode) || currencyCode === "CNY") {
    return failCommand("外币代码必须是三位字母且不能为 CNY", 400, "currencyCode");
  }
  if (!validDate(raw.targetDate)) return failCommand("汇率目标日期无效", 400, "targetDate");
  return okCommand<RefreshStatementExchangeRateCommand>({
    userId,
    input: { currencyCode, targetDate: raw.targetDate },
  });
}

export function buildMonthlyAverageExchangeRateCommand(
  raw: Omit<MonthlyAverageExchangeRateCommand, "userId">,
  userId: number,
) {
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("当前用户无效", 401);
  const currencyCode = raw.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode) || currencyCode === "CNY") {
    return failCommand("外币代码必须是三位字母且不能为 CNY", 400, "currencyCode");
  }
  if (!Number.isInteger(raw.year) || raw.year < 1900 || raw.year > 9999) {
    return failCommand("汇率年份无效", 400, "year");
  }
  if (!Number.isInteger(raw.month) || raw.month < 1 || raw.month > 12) {
    return failCommand("汇率月份无效", 400, "month");
  }
  return okCommand<MonthlyAverageExchangeRateCommand>({
    currencyCode,
    year: raw.year,
    month: raw.month,
    userId,
  });
}

export function buildVoucherHistoricalInvestmentRateCommand(
  raw: Omit<VoucherHistoricalInvestmentRateCommand, "userId">,
  userId: number,
) {
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("当前用户无效", 401);
  if (!Number.isInteger(raw.voucherItemId) || raw.voucherItemId <= 0) {
    return failCommand("投资凭证明细无效", 400, "voucherItemId");
  }
  if (!validDate(raw.voucherDate)) return failCommand("投资凭证日期无效", 400, "voucherDate");
  if (!Number.isFinite(raw.rate) || raw.rate <= 0) return failCommand("历史折算率必须为正数", 400, "rate");
  const matchingLabel = raw.matchingLabel.trim();
  if (!matchingLabel) return failCommand("凭证匹配说明不能为空", 400, "matchingLabel");
  return okCommand<VoucherHistoricalInvestmentRateCommand>({
    voucherItemId: raw.voucherItemId,
    voucherDate: raw.voucherDate,
    rate: raw.rate,
    matchingLabel,
    userId,
  });
}
