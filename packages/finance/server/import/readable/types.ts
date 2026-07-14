export type SourceSystem = "T6" | "TPLUS";
export type DimensionType = "customer" | "supplier" | "person" | "department" | "project" | "expense";

export interface ReadableBatchSpec {
  companyCode: string;
  companyName: string;
  year: number;
  sourceSystem: SourceSystem;
  sourceLedger: string;
  sourceDatabase: string;
  includeCurrentOpenItems?: boolean;
}

export interface NormalizedAuxiliaryRef {
  dimensionType: DimensionType;
  sourceCode: string;
  sourceRole: string;
}

export interface NormalizedAccount {
  sourceKey: string;
  code: string;
  name: string;
  category: string;
  balanceDirection: "debit" | "credit";
  parentSourceKey?: string;
  mnemonicCode?: string;
  currency?: string;
  subjectLevel?: number;
  isActive: boolean;
  isCash: boolean;
  isBank: boolean;
}

export interface NormalizedVoucherItem {
  sourceKey: string;
  accountSourceKey: string;
  accountCode: string;
  sortOrder: number;
  debit: number;
  credit: number;
  description?: string;
  currencyCode?: string;
  exchangeRate?: number;
  originalDebit?: number;
  originalCredit?: number;
  auxiliaryRefs: NormalizedAuxiliaryRef[];
}

export interface NormalizedVoucher {
  sourceKey: string;
  voucherNo: string;
  date: string;
  month: number;
  description: string;
  totalDebit: number;
  totalCredit: number;
  status: "posted" | "draft";
  items: NormalizedVoucherItem[];
}

export interface NormalizedBalance {
  sourceKey: string;
  month: number;
  accountSourceKey: string;
  accountCode: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
  auxiliaryRefs?: NormalizedAuxiliaryRef[];
}

export interface NormalizedAuxiliaryMember {
  dimensionType: DimensionType;
  sourceCode: string;
  sourceName: string;
  shortName?: string;
  identityNumber?: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  bankName?: string;
  bankAccount?: string;
}

export interface NormalizedCashFlowItem {
  sourceCode: string;
  sourceName: string;
  parentSourceCode?: string;
  direction?: string;
}

export interface NormalizedCashFlowAllocation {
  sourceKey: string;
  month: number;
  voucherSourceKey: string;
  cashFlowCode: string;
  ownerSortOrder?: number;
  counterpartSortOrder?: number;
  direction: "inflow" | "outflow";
  amount: number;
}

export interface NormalizedOpenItem {
  sourceKey: string;
  accountSourceKey?: string;
  accountCode?: string;
  voucherItemSourceKey?: string;
  documentNo?: string;
  documentDate?: string;
  dueDate?: string;
  memo?: string;
  currencyCode?: string;
  originalDebit: number;
  originalCredit: number;
  outstandingDebit: number;
  outstandingCredit: number;
  status: "open" | "closed";
  auxiliaryRefs: NormalizedAuxiliaryRef[];
}

export interface NormalizedCurrency {
  sourceCode: string;
  sourceName: string;
  symbol?: string;
  decimalDigits?: number;
  isBase: boolean;
}

export interface NormalizedBankAccount {
  sourceKey: string;
  sourceCode?: string;
  sourceName: string;
  accountSourceKey?: string;
  accountNo?: string;
  bankName?: string;
  currencyCode?: string;
  isActive: boolean;
}

export interface NormalizedReadableBatch {
  spec: ReadableBatchSpec;
  snapshotDate: string;
  cutoffDate: string;
  accounts: NormalizedAccount[];
  vouchers: NormalizedVoucher[];
  sourceBalances: NormalizedBalance[];
  auxiliaryMembers: NormalizedAuxiliaryMember[];
  auxiliaryBalances: NormalizedBalance[];
  cashFlowItems: NormalizedCashFlowItem[];
  cashFlowAllocations: NormalizedCashFlowAllocation[];
  openItems: NormalizedOpenItem[];
  currencies: NormalizedCurrency[];
  bankAccounts: NormalizedBankAccount[];
  closedMonths: Set<number>;
  warnings: string[];
}

export interface ReadableImportPreview {
  spec: ReadableBatchSpec;
  accountCount: number;
  voucherCount: number;
  postedVoucherCount: number;
  draftVoucherCount: number;
  itemCount: number;
  debit: number;
  credit: number;
  difference: number;
  sourceBalanceCount: number;
  auxiliaryMemberCount: number;
  auxiliaryBalanceCount: number;
  cashFlowAllocationCount: number;
  openItemCount: number;
  warnings: string[];
}
