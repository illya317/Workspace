import type { StatementExchangeRateRefreshInput } from "@workspace/finance/types";
import { buildRefreshStatementExchangeRateCommand } from "../domain/statement-exchange-rate-validation";
import { refreshStatementExchangeRate } from "./exchange-rates";

export function buildRefreshStatementExchangeRateRouteCommand(
  input: StatementExchangeRateRefreshInput,
  userId: number,
) {
  return buildRefreshStatementExchangeRateCommand(input, userId);
}

export function executeRefreshStatementExchangeRateRouteCommand(
  command: Parameters<typeof refreshStatementExchangeRate>[0],
) {
  return refreshStatementExchangeRate(command);
}
