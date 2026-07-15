import type { StatementExchangeRateInput } from "@workspace/finance/types";
import { buildSaveStatementExchangeRateCommand } from "../domain/statement-exchange-rate-validation";
import { saveStatementExchangeRate } from "./exchange-rates";

export function buildSaveStatementExchangeRateRouteCommand(
  input: StatementExchangeRateInput,
  userId: number,
) {
  return buildSaveStatementExchangeRateCommand(input, userId);
}

export function executeSaveStatementExchangeRateRouteCommand(
  command: Parameters<typeof saveStatementExchangeRate>[0],
) {
  return saveStatementExchangeRate(command);
}
