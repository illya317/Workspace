export interface Account {
  id: number;
  code: string;
  name: string;
}

export interface VoucherItem {
  id: number;
  accountId: number;
  account: Account;
  debit: number;
  credit: number;
  description: string;
  sortOrder: number;
  relatedEntity?: string | null;
}

export interface VoucherCashFlowAllocation {
  id: number;
  ownerVoucherItemId: number | null;
  counterpartItemId: number | null;
  direction: string;
  amount: number;
  cashFlowItem: {
    sourceCode: string;
    sourceName: string;
  };
}

export interface Period {
  id: number;
  year: number;
  month: number;
}

export interface Voucher {
  id: number;
  voucherNo: string;
  date: string;
  periodId: number;
  period: Period;
  description: string;
  totalDebit: number;
  totalCredit: number;
  status: string;
  companyCode: string | null;
  items: VoucherItem[];
  cashFlowAllocations?: VoucherCashFlowAllocation[];
}

export interface VoucherResponse {
  vouchers: Voucher[];
  total: number;
  page: number;
  pageSize: number;
}

export type FinanceCounterpartyBalanceCategory = "ar" | "ap" | "otherAr" | "otherAp";
export type FinanceLedgerExportView = "accounts" | "vouchers" | "balances" | "counterparty";

export interface FinanceCounterpartyBalanceRow {
  id: string;
  counterpartyCode: string;
  counterpartyName: string;
  counterpartyShortName: string | null;
  counterpartyType: string;
  accountCode: string;
  accountName: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
  sourceBasis: "erpMonthly" | "historicalRollforward";
}

export interface FinanceCounterpartyBalanceTotals {
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface FinanceCounterpartyBalanceResponse {
  data: FinanceCounterpartyBalanceRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totals: FinanceCounterpartyBalanceTotals;
}
