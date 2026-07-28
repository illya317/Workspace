import { BALANCE_SHEET_LINES } from "../statements/config/balance-sheet-lines";
import { CASH_FLOW_LINES } from "../statements/config/cash-flow-lines";
import { INCOME_STATEMENT_LINES } from "../statements/config/income-statement-lines";

const GROUP_VOUCHER_ACCOUNT_NAMES = new Map([
  ...BALANCE_SHEET_LINES,
  ...INCOME_STATEMENT_LINES,
  ...CASH_FLOW_LINES,
].map((line) => [line.lineCode, simpleStatementLabel(line.label)]));

export function groupVoucherCompanySummary(
  companies: readonly {
    companyId: number;
    companyCode: string;
    companyName: string | null;
    sortOrder: number;
  }[],
) {
  const names = [...new Map(companies.flatMap((company) => {
    const name = normalizedName(company.companyName);
    return name ? [[company.companyId, { ...company, companyName: name }] as const] : [];
  })).values()]
    .sort((left, right) => left.sortOrder - right.sortOrder
      || left.companyCode.localeCompare(right.companyCode, "zh-CN", { numeric: true }))
    .map((company) => company.companyName);
  if (names.length >= 2) return `${names[0]} ↔ ${names[1]}`;
  return names[0] ?? "—";
}

export function groupVoucherAccountName(lineCode: string) {
  return GROUP_VOUCHER_ACCOUNT_NAMES.get(lineCode) ?? lineCode;
}

export function groupVoucherOccurrenceDate(source: {
  voucherDate?: string | null;
  openItemVoucherDate?: string | null;
  openItemDocumentDate?: string | null;
  cashFlowVoucherDate?: string | null;
}) {
  return source.voucherDate
    ?? source.openItemVoucherDate
    ?? source.openItemDocumentDate
    ?? source.cashFlowVoucherDate
    ?? null;
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
