import type { StatementExchangeRateRefreshInput } from "@workspace/finance/types";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export interface RefreshStatementExchangeRateCommand {
  input: StatementExchangeRateRefreshInput;
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
