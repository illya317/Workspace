export interface Account {
  id: number;
  code: string;
  name: string;
}

export const WORKSPACE_VOUCHER_SOURCE_SYSTEM = "WORKSPACE";
export const CONSOLIDATION_VOUCHER_TYPE_NAME = "合并凭证";

export interface VoucherItem {
  id: number;
  accountId: number;
  account: Account;
  debit: number;
  credit: number;
  description: string;
  sortOrder: number;
  relatedEntity?: string | null;
  entityName?: string | null;
  counterpartyName?: string | null;
  sourceEvidence?: string | null;
  entitySnapshotId?: number;
  statementType?: "balanceSheet" | "incomeStatement" | "cashFlow";
  lineCode?: string;
  accountCode?: string | null;
  groupAccountId?: number | null;
  currencyCode?: string;
  periodBasis?: "current" | "comparative";
  note?: string | null;
  matchSide?: "left" | "right" | null;
  sourceKind?: "auxiliaryBalance" | "openItem" | "cashFlowAllocation" | "workpaper" | "voucher" | null;
  sourceRecordId?: number | null;
  sourceDate?: string | null;
  counterpartyEntitySnapshotId?: number | null;
  counterpartyCompanyId?: number | null;
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
  sourceSystem?: string | null;
  voucherTypeCode?: string | null;
  voucherTypeName?: string | null;
  matchingLabel?: string | null;
  isAdjustment?: boolean;
  items: VoucherItem[];
  cashFlowAllocations?: VoucherCashFlowAllocation[];
  voucherKind?: "standard" | "group";
  documentType?: FinanceGroupVoucherDocumentType;
  postingLevel?: "10" | "20" | "30";
  origin?: "manual" | "system";
  batchId?: number;
  batchRevision?: number;
  reviewBlockReason?: string | null;
  entryType?: import("./statements").ConsolidationEntryType;
  title?: string;
  entryDescription?: string | null;
  evidence?: string;
}

export interface VoucherResponse {
  vouchers: Voucher[];
  total: number;
  page: number;
  pageSize: number;
}

export type FinanceCounterpartyBalanceCategory = "ar" | "ap" | "otherAr" | "otherAp";
export type FinanceGroupVoucherDocumentType =
  | "groupAdjustment"
  | "elimination"
  | "reclassification"
  | "allocation";
export type FinanceLedgerExportView =
  | "accounts"
  | "groupAccounts"
  | "vouchers"
  | "balances"
  | "counterparty"
  | "assets";

export type FinanceAssetExportView = "cards" | "period" | "adjustments" | "reconciliation";

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
