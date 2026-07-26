import { BALANCE_SHEET_LINES } from "../config/balance-sheet-lines";
import type { BalanceSheetLineConfig } from "../config/balance-sheet-lines";

export async function loadBalanceSheetConfig(
  _companyCode: string,
  _year: number,
): Promise<BalanceSheetLineConfig[]> {
  return BALANCE_SHEET_LINES.map((line) => ({
    ...line,
    prefixes: [...(line.prefixes ?? [])],
    subtractPrefixes: [...(line.subtractPrefixes ?? [])],
  }));
}

// Re-export income + cash flow loaders (defined in load-config-reports.ts
// to keep this file under the 260-line cap).
export { loadIncomeStatementConfig, loadCashFlowConfig } from "./load-config-reports";
export type { IncomeStatementLineRow, CashFlowLineRow } from "./load-config-reports";
