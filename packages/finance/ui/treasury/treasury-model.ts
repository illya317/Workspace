import type {
  BankAccountWriteInput,
  BankReconciliationWriteInput,
  FinanceSourceTraceInput,
  InterestWorkpaperWriteInput,
  LoanWriteInput,
  PrincipalEventAppendInput,
  TreasuryBankAccountDto,
  TreasuryBankReconciliationDto,
  TreasuryInterestWorkpaperDto,
  TreasuryLoanDto,
  TreasuryScope,
  TreasurySourceTraceDto,
  TreasuryWorkspaceDto,
} from "../../types/treasury";

export type BankAccountDraft = Omit<BankAccountWriteInput, "companyId">;
export type LoanDraft = Omit<LoanWriteInput, "companyId">;
export type InterestWorkpaperDraft = Omit<
  InterestWorkpaperWriteInput,
  "calculationVersion" | "inputFingerprint"
>;
export type ReconciliationDraft = BankReconciliationWriteInput;
export type PrincipalEventDraft = PrincipalEventAppendInput;

export type TreasuryView = "bank-accounts" | "bank-reconciliation" | "loans" | "interest";

export const TREASURY_VIEW_KEYS: TreasuryView[] = [
  "bank-accounts",
  "bank-reconciliation",
  "loans",
  "interest",
];

export const TREASURY_STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "prepared", label: "已编制" },
  { value: "reconciled", label: "已核对" },
  { value: "blocked", label: "有阻断" },
];

export const DAY_COUNT_OPTIONS = [
  { value: "actual_365", label: "实际天数 / 365" },
  { value: "actual_360", label: "实际天数 / 360" },
  { value: "30_360", label: "30 / 360" },
];

export function isTreasuryView(value: string): value is TreasuryView {
  return TREASURY_VIEW_KEYS.includes(value as TreasuryView);
}

export function periodStart(scope: TreasuryScope) {
  return `${scope.year}-${String(scope.month).padStart(2, "0")}-01`;
}

export function periodEnd(scope: TreasuryScope) {
  const date = new Date(Date.UTC(scope.year, scope.month, 0));
  return date.toISOString().slice(0, 10);
}

export function manualKey(prefix: string, scope: Pick<TreasuryScope, "companyCode">, token: string) {
  return `${prefix}:${scope.companyCode}:${token}`;
}

export function emptyBankAccountDraft(scope: TreasuryScope, token: string): BankAccountDraft {
  return {
    companyCode: scope.companyCode,
    accountId: null,
    accountYear: scope.year,
    sourceSystem: "workspace",
    sourceLedger: "treasury",
    sourceKey: manualKey("bank-account", scope, token),
    sourceName: "",
    sourceKind: "manual",
    accountNo: null,
    bankName: null,
    currencyCode: "CNY",
    openedOn: null,
    closedOn: null,
    isActive: true,
  };
}

export function editBankAccountDraft(row: TreasuryBankAccountDto): BankAccountDraft {
  return {
    ...traceFromDto(row),
    companyCode: row.companyCode,
    accountId: row.accountId,
    accountYear: row.accountYear,
    sourceSystem: row.sourceSystem,
    sourceLedger: row.sourceLedger,
    sourceKey: row.sourceKey ?? `bank-account:${row.id}`,
    sourceCode: row.sourceCode,
    sourceName: row.sourceName,
    accountNo: row.accountNo,
    bankName: row.bankName,
    currencyCode: row.currencyCode,
    openedOn: row.openedOn,
    closedOn: row.closedOn,
    isActive: row.isActive,
  };
}

export function emptyReconciliationDraft(
  scope: TreasuryWorkspaceDto["scope"],
  bankAccountId: number | null,
): ReconciliationDraft {
  return {
    companyCode: scope.companyCode,
    year: scope.year,
    month: scope.month,
    periodId: scope.periodId ?? 0,
    bankAccountId: bankAccountId ?? 0,
    statementDate: periodEnd(scope),
    statementEndingBalance: 0,
    ledgerEndingBalance: 0,
    status: "draft",
    conclusion: null,
    evidenceRef: null,
    sourceKind: "manual",
    items: [],
  };
}

export function editReconciliationDraft(
  scope: TreasuryWorkspaceDto["scope"],
  row: TreasuryBankReconciliationDto,
): ReconciliationDraft {
  return {
    ...traceFromDto(row),
    companyCode: scope.companyCode,
    year: scope.year,
    month: scope.month,
    periodId: row.periodId,
    bankAccountId: row.bankAccountId,
    statementDate: row.statementDate,
    statementEndingBalance: row.statementEndingBalance,
    ledgerEndingBalance: row.ledgerEndingBalance,
    status: treasuryStatus(row.status),
    conclusion: row.conclusion,
    evidenceRef: row.evidenceRef,
    items: row.items.map((item) => ({
      ...traceFromDto(item),
      id: item.id,
      version: item.version,
      voucherItemId: item.voucherItemId,
      itemKind: item.itemKind === "ledger_adjustment" ? "ledger_adjustment" : "bank_adjustment",
      occurredOn: item.occurredOn,
      referenceNo: item.referenceNo,
      description: item.description,
      amount: item.amount,
      clearedOn: item.clearedOn,
      status: item.status === "cleared" || item.status === "review" ? item.status : "open",
    })),
  };
}

export function emptyLoanDraft(scope: TreasuryScope, token: string): LoanDraft {
  const startOn = periodStart(scope);
  return {
    companyCode: scope.companyCode,
    lenderPartyId: 0,
    identityKey: manualKey("loan", scope, token),
    loanNo: "",
    name: "",
    currencyCode: "CNY",
    contractPrincipalAmount: 0,
    startOn,
    endOn: null,
    status: "draft",
    note: null,
    sourceKind: "manual",
    rateTerms: [{
      effectiveFrom: startOn,
      effectiveThrough: null,
      annualRate: 0,
      spreadRate: null,
      rateKind: "fixed",
      benchmark: null,
      dayCountConvention: "actual_365",
      sourceKind: "manual",
    }],
  };
}

export function editLoanDraft(row: TreasuryLoanDto): LoanDraft {
  return {
    ...traceFromDto(row),
    companyCode: row.companyCode,
    lenderPartyId: row.lenderPartyId,
    identityKey: row.identityKey,
    loanNo: row.loanNo,
    name: row.name,
    currencyCode: row.currencyCode,
    contractPrincipalAmount: row.contractPrincipalAmount,
    startOn: row.startOn,
    endOn: row.endOn,
    status: row.status === "active" || row.status === "settled" || row.status === "cancelled" ? row.status : "draft",
    note: row.note,
    rateTerms: row.rateTerms.map((term) => ({
      ...traceFromDto(term),
      id: term.id,
      effectiveFrom: term.effectiveFrom,
      effectiveThrough: term.effectiveThrough,
      annualRate: term.annualRate,
      spreadRate: term.spreadRate,
      rateKind: term.rateKind === "floating" ? "floating" : "fixed",
      benchmark: term.benchmark,
      dayCountConvention: term.dayCountConvention,
    })),
  };
}

export function emptyPrincipalEventDraft(
  scope: TreasuryWorkspaceDto["scope"],
  loanId: number,
  token: string,
): PrincipalEventDraft {
  return {
    companyCode: scope.companyCode,
    year: scope.year,
    month: scope.month,
    periodId: scope.periodId ?? 0,
    loanId,
    eventKind: "drawdown",
    occurredOn: periodEnd(scope),
    amount: 0,
    voucherItemId: null,
    referenceNo: null,
    note: null,
    reversesEventId: null,
    idempotencyKey: manualKey("principal-event", scope, token),
    sourceKind: "manual",
  };
}

export function emptyInterestDraft(
  scope: TreasuryWorkspaceDto["scope"],
  loan: TreasuryLoanDto | null,
): InterestWorkpaperDraft {
  const convention = uniqueLoanConvention(loan);
  return {
    companyCode: scope.companyCode,
    year: scope.year,
    month: scope.month,
    periodId: scope.periodId ?? 0,
    loanId: loan?.id ?? 0,
    status: "draft",
    dayCountConvention: convention ?? "actual_365",
    note: null,
    sourceKind: "manual",
    lines: [],
    voucherLinks: [],
  };
}

export function editInterestDraft(
  scope: TreasuryWorkspaceDto["scope"],
  row: TreasuryInterestWorkpaperDto,
): InterestWorkpaperDraft {
  return {
    ...traceFromDto(row),
    companyCode: scope.companyCode,
    year: scope.year,
    month: scope.month,
    periodId: row.periodId,
    loanId: row.loanId,
    status: treasuryStatus(row.status),
    dayCountConvention: row.dayCountConvention,
    note: row.note,
    lines: row.lines.map((line) => ({
      ...traceFromDto(line),
      id: line.id,
      lineNo: line.lineNo,
      accrualFrom: line.accrualFrom,
      accrualThrough: line.accrualThrough,
      principalBasis: line.principalBasis,
      annualRate: line.annualRate,
      dayCount: line.dayCount,
      sourceReportedInterestAmount: line.sourceReportedInterestAmount,
      note: line.note,
    })),
    voucherLinks: row.voucherLinks.map((link) => ({
      ...traceFromDto(link),
      id: link.id,
      voucherItemId: link.voucherItemId,
      linkKind: link.linkKind === "payment" || link.linkKind === "reversal" ? link.linkKind : "accrual",
      amount: link.amount,
      note: link.note,
    })),
  };
}

export function uniqueLoanConvention(loan: TreasuryLoanDto | null) {
  if (!loan) return null;
  const values = new Set(loan.rateTerms.map((term) => term.dayCountConvention));
  return values.size === 1 ? [...values][0] : null;
}

export function canSaveBankAccount(draft: BankAccountDraft) {
  return Boolean(
    draft.companyCode.trim()
    && draft.sourceSystem.trim()
    && draft.sourceLedger.trim()
    && draft.sourceKey.trim()
    && draft.sourceName.trim(),
  );
}

export function canSaveReconciliation(draft: ReconciliationDraft) {
  return draft.bankAccountId > 0
    && draft.periodId > 0
    && Boolean(draft.statementDate)
    && draft.items.every((item) => Boolean(item.description.trim()) && Number.isFinite(item.amount) && item.amount !== 0);
}

export function canSaveLoan(draft: LoanDraft) {
  return draft.lenderPartyId > 0
    && Boolean(draft.identityKey.trim() && draft.loanNo.trim() && draft.name.trim() && draft.currencyCode.trim() && draft.startOn)
    && draft.contractPrincipalAmount > 0
    && draft.rateTerms.length > 0
    && draft.rateTerms.every((term) => Boolean(term.effectiveFrom) && Number.isFinite(term.annualRate));
}

export function canSavePrincipalEvent(draft: PrincipalEventDraft) {
  return draft.loanId > 0
    && draft.periodId > 0
    && draft.amount > 0
    && Boolean(draft.occurredOn && draft.idempotencyKey.length >= 8)
    && (draft.eventKind !== "reversal" || Boolean(draft.reversesEventId));
}

export function canAppendPrincipalEvent(
  scope: TreasuryWorkspaceDto["scope"],
  draft: PrincipalEventDraft,
) {
  return Boolean(scope.periodId)
    && !scope.isClosed
    && draft.companyCode === scope.companyCode
    && draft.year === scope.year
    && draft.month === scope.month
    && draft.periodId === scope.periodId
    && canSavePrincipalEvent(draft);
}

export function canSaveInterest(draft: InterestWorkpaperDraft) {
  return draft.loanId > 0
    && draft.periodId > 0
    && draft.lines.length > 0
    && draft.lines.every((line) => (
      line.lineNo > 0
      && Boolean(line.accrualFrom && line.accrualThrough)
      && line.principalBasis >= 0
      && line.annualRate >= 0
      && line.dayCount > 0
    ))
    && draft.voucherLinks.every((link) => link.voucherItemId > 0 && link.amount > 0);
}

export function formatAmount(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function treasuryStatusLabel(status: string) {
  return ({
    draft: "草稿",
    prepared: "已编制",
    reconciled: "已核对",
    blocked: "有阻断",
    active: "执行中",
    settled: "已结清",
    cancelled: "已取消",
  } as Record<string, string>)[status] ?? status;
}

export function statusTone(status: string): "success" | "warning" | "danger" | "muted" | "default" {
  if (status === "reconciled" || status === "active" || status === "settled") return "success";
  if (status === "blocked") return "danger";
  if (status === "prepared") return "warning";
  return "muted";
}

function traceFromDto(row: TreasurySourceTraceDto): FinanceSourceTraceInput {
  return {
    sourceKind: row.sourceKind,
    sourceReleaseId: row.sourceReleaseId,
    sourceSha256: row.sourceSha256,
    sourceFile: row.sourceFile,
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    sourceRange: row.sourceRange,
    sourceKey: row.sourceKey,
  };
}

function treasuryStatus(status: string): ReconciliationDraft["status"] {
  return status === "prepared" || status === "reconciled" || status === "blocked" ? status : "draft";
}
