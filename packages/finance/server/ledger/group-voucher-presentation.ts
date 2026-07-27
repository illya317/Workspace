import { BALANCE_SHEET_LINES } from "../statements/config/balance-sheet-lines";
import { CASH_FLOW_LINES } from "../statements/config/cash-flow-lines";
import { INCOME_STATEMENT_LINES } from "../statements/config/income-statement-lines";

const GROUP_VOUCHER_ACCOUNT_NAMES = new Map([
  ...BALANCE_SHEET_LINES,
  ...INCOME_STATEMENT_LINES,
  ...CASH_FLOW_LINES,
].map((line) => [line.lineCode, simpleStatementLabel(line.label)]));

export function groupVoucherCompanySummary(
  lines: readonly { entityName: string | null; counterpartyName: string | null }[],
) {
  const names = [...new Set(lines.flatMap((line) => [
    normalizedName(line.entityName),
    normalizedName(line.counterpartyName),
  ]).filter((name): name is string => Boolean(name)))];
  if (names.length >= 2) return `${names[0]} ↔ ${names[1]}`;
  return names[0] ?? "—";
}

export function groupVoucherAccountName(lineCode: string) {
  return GROUP_VOUCHER_ACCOUNT_NAMES.get(lineCode) ?? lineCode;
}

function normalizedName(value: string | null) {
  return value?.trim() || null;
}

function simpleStatementLabel(label: string) {
  return label.trim()
    .replace(/^[一-十]+、/u, "")
    .replace(/^(?:加|减)：/u, "")
    .replace(/：$/u, "");
}
