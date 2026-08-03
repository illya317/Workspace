import type { StatementExchangeRateRefreshInput } from "@workspace/finance/types";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export interface RefreshStatementExchangeRateCommand {
  input: StatementExchangeRateRefreshInput;
  userId: number;
}

export interface VoucherHistoricalInvestmentRateCommand {
  voucherItemId: number;
  contributionDate: string;
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

export interface CapitalHistoricalAmountRateCommand {
  sourceKind: "accountBalance" | "voucherItem";
  sourceRecordId: number;
  evidenceDate: string;
  currencyCode: string;
  originalAmount: number;
  historicalAmountCny: number;
  weightedRate: number;
  evidence: string;
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
  if (!validDate(raw.contributionDate)) return failCommand("实际出资日期无效", 400, "contributionDate");
  if (!Number.isFinite(raw.rate) || raw.rate <= 0) return failCommand("历史折算率必须为正数", 400, "rate");
  const matchingLabel = raw.matchingLabel.trim();
  if (!matchingLabel) return failCommand("凭证匹配说明不能为空", 400, "matchingLabel");
  return okCommand<VoucherHistoricalInvestmentRateCommand>({
    voucherItemId: raw.voucherItemId,
    contributionDate: raw.contributionDate,
    rate: raw.rate,
    matchingLabel,
    userId,
  });
}

export function buildCapitalHistoricalAmountRateCommand(
  raw: Omit<CapitalHistoricalAmountRateCommand, "currencyCode" | "weightedRate" | "userId"> & {
    originalCurrency: string;
  },
  userId: number,
) {
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("当前用户无效", 401);
  if (raw.sourceKind !== "accountBalance" && raw.sourceKind !== "voucherItem") {
    return failCommand("历史资本证据来源无效", 400, "sourceKind");
  }
  if (!Number.isInteger(raw.sourceRecordId) || raw.sourceRecordId <= 0) {
    return failCommand("历史资本来源记录无效", 400, "sourceRecordId");
  }
  if (!validDate(raw.evidenceDate)) return failCommand("历史资本证据日期无效", 400, "evidenceDate");
  const currencyCode = raw.originalCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode) || currencyCode === "CNY") {
    return failCommand("历史资本原币无效", 400, "originalCurrency");
  }
  if (!Number.isFinite(raw.originalAmount) || raw.originalAmount <= 0) {
    return failCommand("历史资本原币金额无效", 400, "originalAmount");
  }
  if (!Number.isFinite(raw.historicalAmountCny) || raw.historicalAmountCny <= 0) {
    return failCommand("历史资本人民币金额无效", 400, "historicalAmountCny");
  }
  const evidence = raw.evidence.trim();
  if (!evidence) return failCommand("历史资本证据不能为空", 400, "evidence");
  const weightedRate = Math.round((raw.historicalAmountCny / raw.originalAmount) * 100_000_000) / 100_000_000;
  if (!Number.isFinite(weightedRate) || weightedRate <= 0) {
    return failCommand("历史资本加权汇率无效", 400, "weightedRate");
  }
  return okCommand<CapitalHistoricalAmountRateCommand>({
    sourceKind: raw.sourceKind,
    sourceRecordId: raw.sourceRecordId,
    evidenceDate: raw.evidenceDate,
    currencyCode,
    originalAmount: raw.originalAmount,
    historicalAmountCny: raw.historicalAmountCny,
    weightedRate,
    evidence,
    userId,
  });
}
