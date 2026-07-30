export type FinanceSourceTraceInput = {
  sourceKind?: string | null;
  sourceReleaseId?: string | null;
  sourceSha256?: string | null;
  sourceFile?: string | null;
  sourceSheet?: string | null;
  sourceRow?: number | null;
  sourceRange?: string | null;
  sourceKey?: string | null;
};

export type TreasuryScope = { companyCode: string; year: number; month: number };
export type TreasuryStatus = "draft" | "prepared" | "reconciled" | "blocked";
export type DayCountConvention = "actual_365" | "actual_360" | "30_360";

export type BankAccountWriteInput = FinanceSourceTraceInput & {
  companyCode: string;
  accountId?: number | null;
  accountYear?: number | null;
  sourceSystem: string;
  sourceLedger: string;
  sourceKey: string;
  sourceCode?: string | null;
  sourceName: string;
  accountNo?: string | null;
  bankName?: string | null;
  currencyCode?: string | null;
  openedOn?: string | null;
  closedOn?: string | null;
  isActive: boolean;
};

export type BankReconciliationItemInput = FinanceSourceTraceInput & {
  id?: number;
  version?: number;
  voucherItemId?: number | null;
  itemKind: "bank_adjustment" | "ledger_adjustment";
  occurredOn?: string | null;
  referenceNo?: string | null;
  description: string;
  amount: number;
  clearedOn?: string | null;
  status: "open" | "cleared" | "review";
};

export type BankReconciliationWriteInput = FinanceSourceTraceInput & {
  bankAccountId: number;
  periodId: number;
  companyCode: string;
  year: number;
  month: number;
  statementDate: string;
  statementEndingBalance: number;
  ledgerEndingBalance: number;
  status: TreasuryStatus;
  conclusion?: string | null;
  evidenceRef?: string | null;
  /** Upsert only. Existing children omitted here remain unchanged. */
  items: BankReconciliationItemInput[];
};

export type LoanRateTermInput = FinanceSourceTraceInput & {
  id?: number;
  effectiveFrom: string;
  effectiveThrough?: string | null;
  annualRate: number;
  spreadRate?: number | null;
  rateKind: "fixed" | "floating";
  benchmark?: string | null;
  dayCountConvention: DayCountConvention;
};

export type LoanWriteInput = FinanceSourceTraceInput & {
  companyCode: string;
  lenderPartyId: number;
  identityKey: string;
  loanNo: string;
  name: string;
  currencyCode: string;
  contractPrincipalAmount: number;
  startOn: string;
  endOn?: string | null;
  status: "draft" | "active" | "settled" | "cancelled";
  note?: string | null;
  /** Upsert only. Existing terms omitted here remain unchanged. */
  rateTerms: LoanRateTermInput[];
};

export type PrincipalEventAppendInput = FinanceSourceTraceInput & {
  loanId: number;
  companyCode: string;
  year: number;
  month: number;
  periodId: number;
  voucherItemId?: number | null;
  eventKind: "drawdown" | "repayment" | "reversal";
  occurredOn: string;
  amount: number;
  referenceNo?: string | null;
  note?: string | null;
  reversesEventId?: number | null;
  idempotencyKey: string;
};

export type InterestWorkpaperLineInput = FinanceSourceTraceInput & {
  id?: number;
  lineNo: number;
  accrualFrom: string;
  accrualThrough: string;
  principalBasis: number;
  annualRate: number;
  dayCount: number;
  sourceReportedInterestAmount?: number | null;
  note?: string | null;
};

export type InterestVoucherLinkInput = FinanceSourceTraceInput & {
  id?: number;
  voucherItemId: number;
  linkKind: "accrual" | "payment" | "reversal";
  amount: number;
  note?: string | null;
};

export type InterestWorkpaperWriteInput = FinanceSourceTraceInput & {
  loanId: number;
  periodId: number;
  companyCode: string;
  year: number;
  month: number;
  status: TreasuryStatus;
  dayCountConvention: DayCountConvention;
  note?: string | null;
  /** Upsert only. Existing children omitted here remain unchanged. */
  lines: InterestWorkpaperLineInput[];
  voucherLinks: InterestVoucherLinkInput[];
};

export type TreasuryCreateInput =
  | ({ kind: "bank_account_create" } & BankAccountWriteInput)
  | ({ kind: "bank_reconciliation_create" } & BankReconciliationWriteInput)
  | ({ kind: "loan_create" } & LoanWriteInput)
  | ({ kind: "principal_event_append" } & PrincipalEventAppendInput)
  | ({ kind: "interest_workpaper_create" } & InterestWorkpaperWriteInput);

export type TreasuryUpdateInput =
  | ({ kind: "bank_account_update"; id: number; version: number } & BankAccountWriteInput)
  | ({ kind: "bank_reconciliation_update"; id: number; version: number } & BankReconciliationWriteInput)
  | ({ kind: "loan_update"; id: number; version: number } & LoanWriteInput)
  | ({ kind: "interest_workpaper_update"; id: number; version: number } & InterestWorkpaperWriteInput);

export type TreasuryBlockerDto = {
  code: string;
  message: string;
  entityKind: "scope" | "bank_account" | "bank_reconciliation" | "loan" | "interest_workpaper";
  entityId: number | null;
  deepLink: string;
};

export type TreasuryBankAccountDto = TreasurySourceTraceDto & {
  id: number;
  version: number;
  companyId: number | null;
  companyCode: string;
  accountId: number | null;
  accountYear: number | null;
  accountCode?: string | null;
  accountName?: string | null;
  sourceSystem: string;
  sourceLedger: string;
  sourceKey: string;
  sourceCode: string | null;
  sourceName: string;
  accountNo: string | null;
  bankName: string | null;
  currencyCode: string | null;
  openedOn: string | null;
  closedOn: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TreasuryBankReconciliationItemDto = TreasurySourceTraceDto & {
  id: number;
  version: number;
  voucherItemId: number | null;
  voucherItemName?: string | null;
  itemKind: string;
  occurredOn: string | null;
  referenceNo: string | null;
  description: string;
  amount: number;
  clearedOn: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type TreasuryBankReconciliationDto = TreasurySourceTraceDto & {
  id: number;
  version: number;
  bankAccountId: number;
  periodId: number;
  statementDate: string;
  statementEndingBalance: number;
  ledgerEndingBalance: number;
  status: string;
  conclusion: string | null;
  evidenceRef: string | null;
  items: TreasuryBankReconciliationItemDto[];
  calculation: {
    bankAdjustments: number;
    ledgerAdjustments: number;
    adjustedBankBalance: number;
    adjustedLedgerBalance: number;
    difference: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type TreasuryLoanRateTermDto = TreasurySourceTraceDto & {
  id: number;
  effectiveFrom: string;
  effectiveThrough: string | null;
  annualRate: number;
  spreadRate: number | null;
  rateKind: string;
  benchmark: string | null;
  dayCountConvention: DayCountConvention;
  createdAt: string;
};

export type TreasuryPrincipalEventDto = TreasurySourceTraceDto & {
  id: number;
  loanId: number;
  voucherItemId: number | null;
  voucherItemName?: string | null;
  eventKind: string;
  occurredOn: string;
  amount: number;
  referenceNo: string | null;
  note: string | null;
  reversesEventId: number | null;
  idempotencyKey: string;
  recordedAt: string;
};

export type TreasuryLoanDto = TreasurySourceTraceDto & {
  id: number;
  version: number;
  companyId: number;
  companyCode: string;
  lenderPartyId: number;
  lenderPartyName?: string | null;
  identityKey: string;
  loanNo: string;
  name: string;
  currencyCode: string;
  contractPrincipalAmount: number;
  principalBalance: number;
  startOn: string;
  endOn: string | null;
  status: string;
  note: string | null;
  rateTerms: TreasuryLoanRateTermDto[];
  principalEvents: TreasuryPrincipalEventDto[];
  createdAt: string;
  updatedAt: string;
};

export type TreasuryInterestWorkpaperLineDto = TreasurySourceTraceDto & {
  id: number;
  lineNo: number;
  accrualFrom: string;
  accrualThrough: string;
  principalBasis: number;
  annualRate: number;
  dayCount: number;
  sourceReportedInterestAmount: number | null;
  calculatedAmount: number;
  sourceDifference: number | null;
  note: string | null;
  createdAt: string;
};

export type TreasuryInterestVoucherLinkDto = TreasurySourceTraceDto & {
  id: number;
  voucherItemId: number;
  voucherItemName?: string | null;
  linkKind: string;
  amount: number;
  note: string | null;
  createdAt: string;
};

export type TreasuryInterestWorkpaperDto = TreasurySourceTraceDto & {
  id: number;
  version: number;
  loanId: number;
  periodId: number;
  status: string;
  calculationVersion: string;
  inputFingerprint: string;
  dayCountConvention: DayCountConvention;
  note: string | null;
  lines: TreasuryInterestWorkpaperLineDto[];
  voucherLinks: TreasuryInterestVoucherLinkDto[];
  calculation: {
    calculatedAmount: number;
    sourceReportedAmount: number | null;
    sourceDifference: number | null;
    voucherAmount: number;
    voucherDifference: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type TreasurySourceTraceDto = {
  sourceKind: string | null;
  sourceReleaseId: string | null;
  sourceSha256: string | null;
  sourceFile: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  sourceRange: string | null;
  sourceKey: string | null;
};

export type TreasuryWorkspaceDto = {
  scope: TreasuryScope & { periodId: number | null; isClosed: boolean };
  bankAccounts: TreasuryBankAccountDto[];
  bankReconciliations: TreasuryBankReconciliationDto[];
  loans: TreasuryLoanDto[];
  interestWorkpapers: TreasuryInterestWorkpaperDto[];
  blockers: TreasuryBlockerDto[];
  evidenceRefs: string[];
};
