export type SourceSystem = "T6" | "TPLUS";
export type DimensionType = "customer" | "supplier" | "person" | "department" | "project" | "expense";

export interface ReadableBatchSpec {
  companyCode: string;
  companyName: string;
  year: number;
  sourceSystem: SourceSystem;
  sourceLedger: string;
  sourceDatabase: string;
  mappingMode: "recurring" | "historical";
  mappingStartYear: number;
  mappingEndYear?: number;
  continuationOf?: string;
  includeCurrentOpenItems?: boolean;
}

export interface ReadableSourcePackageEvidence {
  packageKey: string;
  archiveRevision: string;
  sourcePath: string;
  snapshotDate: string;
  cutoffDate: string;
  isAccountingClose: boolean;
  previousSnapshot?: string;
  sourceMapChecksum: string;
  manifestChecksum: string;
  validationChecksum: string;
  selectedDatabaseChecksum: string;
  validationStatus: "verified";
  manifestEntryCount: number;
  validatedTableCount: number;
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
  auxiliaryRequirements: Array<{ dimensionType: DimensionType; sourceField: string }>;
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
  settlementStyle?: string;
  settlementNo?: string;
  settlementDate?: string;
  sourceMetadata?: Record<string, string | number | boolean>;
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
  voucherTypeCode?: string;
  voucherTypeName?: string;
  isAdjustment: boolean;
  preparerName?: string;
  reviewerName?: string;
  posterName?: string;
  cashierName?: string;
  attachmentCount: number;
  sourcePosted: boolean;
  sourceAudited: boolean;
  sourceInvalid: boolean;
  externalSourceSystem?: string;
  externalSourceDocumentNo?: string;
  externalSourceDocumentId?: string;
  externalSourceAccountSet?: string;
  externalSourceDate?: string;
  sourceMetadata?: Record<string, string | number | boolean>;
  items: NormalizedVoucherItem[];
}

export interface NormalizedPeriodStatus {
  month: number;
  sourceKey: string;
  startDate?: string;
  endDate?: string;
  glMonthEnd: boolean | null;
  accountingClosed: boolean | null;
  moduleStatuses: Record<string, boolean | null>;
}

export interface NormalizedLedgerMetadata {
  sourceName: string;
  startYear?: number;
  startMonth?: number;
  baseCurrencyCode?: string;
  baseCurrencyName?: string;
  accountingStandard?: string;
  entityType?: string;
  masterUser?: string;
}

export interface NormalizedSubsystemStatus {
  sourceKey: string;
  subsystemCode: string;
  isDeleted: boolean;
  isYearClosed: boolean | null;
  lastProcessedPeriod?: number;
  enabledFrom?: string;
  sourceUser?: string;
}

export interface NormalizedAccountLineage {
  sourceKey: string;
  currentAccountSourceKey: string;
  previousAccountSourceKey: string;
  currentYear: number;
  previousYear: number;
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
  originType?: "current" | "periodBegin";
  sourcePeriodBeginDetailId?: string;
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
  sourcePackage: ReadableSourcePackageEvidence;
  ledgerMetadata: NormalizedLedgerMetadata;
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
  periodStatuses: NormalizedPeriodStatus[];
  subsystemStatuses: NormalizedSubsystemStatus[];
  accountLineage: NormalizedAccountLineage[];
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
