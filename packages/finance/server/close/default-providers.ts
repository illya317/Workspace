import type { InventoryClosingContract } from "@workspace/platform/contracts/inventory-closing";
import type { FinanceCloseBlockerDto, FinanceCloseProvider, FinanceCloseProviderInspection, FinanceCloseScope } from "../../types/close";
import type { TaxWorkspaceDto } from "../../types/tax";
import { FINANCE_ASSET_CLOSE_PROVIDERS } from "../assets/close-provider";
import { taxRegistrationPeriodScope } from "../tax/registration-period-scope";
import { listTaxWorkspace } from "../tax/service";
import { listTreasuryWorkspace } from "../treasury/service";
import { buildInventoryCloseProviders } from "./inventory-providers";
import { financeCloseInspectionFingerprint } from "./inspection-identity";
import { buildLedgerStatementFinanceCloseProviderFragment } from "./ledger-statement-providers";
import { buildFinanceCloseProviderRegistry } from "./providers";
import { bankAccountAppliesToClosePeriod, cancelledLoanNeedsCloseReview, loanAppliesToClosePeriod } from "./treasury-period-scope";
import { treasuryReceiptsCloseProvider } from "./treasury-receipts-provider";

const unique = (values: string[]) => [...new Set(values)].sort();
const link = (path: string, scope: FinanceCloseScope) => `${path}${path.includes("?") ? "&" : "?"}companyCode=${encodeURIComponent(scope.companyCode)}&year=${scope.year}&month=${scope.month}`;
const blocker = (item: { code: string; message: string; deepLink: string }): FinanceCloseBlockerDto => ({ code: item.code, message: item.message, deepLink: item.deepLink });

function result(
  status: FinanceCloseProviderInspection["status"], contributorVersion: string, deepLink: string,
  payload: unknown, blockers: FinanceCloseBlockerDto[] = [], evidenceRefs: string[] = [], voucherRefs: string[] = [],
): FinanceCloseProviderInspection {
  const normalizedEvidenceRefs = unique(evidenceRefs);
  const normalizedVoucherRefs = unique(voucherRefs);
  return {
    status, contributorVersion,
    inputFingerprint: financeCloseInspectionFingerprint({ status, blockers, evidenceRefs: normalizedEvidenceRefs, voucherRefs: normalizedVoucherRefs, deepLink, payload }),
    blockers, evidenceRefs: normalizedEvidenceRefs, voucherRefs: normalizedVoucherRefs, deepLink, payload,
  };
}

const treasuryReconciliation: FinanceCloseProvider = {
  inspectPeriodClose: async (scope) => {
    const workspace = await listTreasuryWorkspace(scope);
    const periodAccountIds = workspace.bankAccounts.filter((row) => bankAccountAppliesToClosePeriod(row, scope)).map((row) => row.id).sort((a, b) => a - b);
    const periodAccountIdSet = new Set(periodAccountIds);
    const rows = workspace.bankReconciliations.filter((row) => periodAccountIdSet.has(row.bankAccountId)).map((row) => ({ id: row.id, bankAccountId: row.bankAccountId, status: row.status, version: row.version, difference: row.calculation.difference }));
    const rowIds = new Set(rows.map((row) => row.id));
    const blockers = workspace.blockers.filter((item) => item.code.includes("period") || (item.code.includes("bank_reconciliation") && (item.entityId == null || rowIds.has(item.entityId)))).map(blocker);
    const reconciledIds = new Set(rows.filter((row) => row.status === "reconciled" && Math.abs(row.difference) <= 0.01).map((row) => row.bankAccountId));
    const ready = periodAccountIds.length > 0 && periodAccountIds.every((id) => reconciledIds.has(id));
    const payload = { periodId: workspace.scope.periodId, periodBankAccountIds: periodAccountIds, reconciliations: rows };
    return result(blockers.length ? "blocked" : ready ? "ready" : "pending", "treasury-reconciliation-close-v2", link("/finance/treasury?view=bank-reconciliation", scope), payload, blockers, rows.map((row) => `finance-bank-reconciliation:${row.id}`), workspace.bankReconciliations.filter((row) => rowIds.has(row.id)).flatMap((row) => row.items.flatMap((item) => item.voucherItemId == null ? [] : [`finance-voucher-item:${item.voucherItemId}`])));
  },
};

const treasuryInterest: FinanceCloseProvider = {
  inspectPeriodClose: async (scope) => {
    const workspace = await listTreasuryWorkspace(scope);
    const loans = workspace.loans.filter((row) => loanAppliesToClosePeriod(row, scope));
    const loanIds = new Set(loans.map((row) => row.id));
    const rows = workspace.interestWorkpapers.filter((row) => loanIds.has(row.loanId)).map((row) => ({ id: row.id, loanId: row.loanId, status: row.status, version: row.version, voucherDifference: row.calculation.voucherDifference, sourceDifference: row.calculation.sourceDifference }));
    const rowIds = new Set(rows.map((row) => row.id));
    const cancelledBlockers = loans.filter((loan) => cancelledLoanNeedsCloseReview(loan, scope)).map((loan) => ({ code: "treasury_cancelled_loan_effective_date_missing", message: `借款合同 ${loan.loanNo} 已取消但缺少取消生效日期，需确认本期是否计息`, deepLink: link("/finance/treasury?view=loans", scope) }));
    const blockers = [...workspace.blockers.filter((item) => item.code.includes("period") || (item.code.includes("interest") && (item.entityId == null || rowIds.has(item.entityId)))).map(blocker), ...cancelledBlockers];
    const readyLoans = new Set(rows.filter((row) => row.status === "reconciled" && Math.abs(row.voucherDifference) <= 0.01 && (row.sourceDifference == null || Math.abs(row.sourceDifference) <= 0.01)).map((row) => row.loanId));
    const ready = loans.length > 0 && loans.every((loan) => readyLoans.has(loan.id));
    const payload = { periodId: workspace.scope.periodId, periodLoanIds: [...loanIds].sort((a, b) => a - b), workpapers: rows };
    return result(blockers.length ? "blocked" : ready ? "ready" : "pending", "treasury-interest-close-v2", link("/finance/treasury?view=interest", scope), payload, blockers, rows.map((row) => `finance-interest-workpaper:${row.id}`), workspace.interestWorkpapers.filter((row) => rowIds.has(row.id)).flatMap((row) => row.voucherLinks.map((item) => `finance-voucher-item:${item.voucherItemId}`)));
  },
};

function numberField(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "number" ? value : typeof value === "string" && value ? Number(value) : null;
}

function stringField(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "string" ? row[key] as string : null;
}

const taxAccrual: FinanceCloseProvider = {
  inspectPeriodClose: async (scope) => {
    const workspace = await listTaxWorkspace(scope);
    return inspectTaxAccrualWorkspace(scope, workspace);
  },
};

export function inspectTaxAccrualWorkspace(
  scope: FinanceCloseScope,
  workspace: TaxWorkspaceDto,
): FinanceCloseProviderInspection {
  const monthEnd = new Date(Date.UTC(scope.year, scope.month, 0)).toISOString().slice(0, 10);
  const registrationIds = workspace.registrations.filter((row) => taxRegistrationPeriodScope({
    status: stringField(row, "status") ?? "draft",
    effectiveFrom: stringField(row, "effectiveFrom") ?? "9999-12-31",
    effectiveThrough: stringField(row, "effectiveThrough"),
  }, scope).inScope).map((row) => numberField(row, "id")).filter((id): id is number => id != null).sort((a, b) => a - b);
  const activeIds = new Set(registrationIds);
  const workpapers = workspace.workpapers.filter((row) => activeIds.has(numberField(row, "registrationId") ?? -1));
  const filings = workspace.filings.filter((row) => activeIds.has(numberField(row, "registrationId") ?? -1));
  const workpaperIds = new Set(workpapers.flatMap((row) => numberField(row, "id") ?? []));
  const filingIds = new Set(filings.flatMap((row) => numberField(row, "id") ?? []));
  const relevantBlockers = workspace.blockers.filter((item) => item.entityKind === "scope"
    || (item.entityKind === "registration" && item.entityId != null && activeIds.has(item.entityId))
    || (item.entityKind === "workpaper" && item.entityId != null && workpaperIds.has(item.entityId))
    || (item.entityKind === "filing" && item.entityId != null && filingIds.has(item.entityId)));
  const readyRegistrationIds = registrationIds.filter((registrationId) => {
    const workpaper = workpapers.find((row) => numberField(row, "registrationId") === registrationId);
    const filing = filings.find((row) => numberField(row, "registrationId") === registrationId);
    return Boolean(workpaper && filing && taxWorkpaperHasCompleteEvidence(workpaper) && taxFilingHasCompleteEvidence(filing));
  });
  const effectivePaymentIds = new Set(filings.flatMap((filing) => {
    const reconciliation = recordField(filing, "reconciliation");
    return arrayNumbers(reconciliation?.effectivePaymentIds);
  }));
  const relevantPayments = workspace.payments.filter((row) => effectivePaymentIds.has(numberField(row, "id") ?? -1));
  const payload = {
    periodId: workspace.scope.periodId,
    asOfDate: monthEnd,
    periodRegistrationIds: registrationIds,
    readyRegistrationIds,
    workpapers: workpapers.map(taxCloseWorkpaperPayload),
    filings: filings.map(taxCloseFilingPayload),
    effectivePaymentIds: [...effectivePaymentIds].sort((left, right) => left - right),
  };
  const evidenceRefs = [
    ...workpapers.flatMap((row) => numberField(row, "id") == null ? [] : [`finance-tax-workpaper:${numberField(row, "id")}`]),
    ...filings.flatMap((row) => numberField(row, "id") == null ? [] : [`finance-tax-filing:${numberField(row, "id")}`]),
    ...relevantPayments.flatMap((row) => numberField(row, "id") == null ? [] : [`finance-tax-payment:${numberField(row, "id")}`]),
  ];
  const voucherRefs = [
    ...workpapers.flatMap((row) => arrayRecords(row.accrualLines).flatMap((line) => numberField(line, "voucherItemId") == null ? [] : [`finance-voucher-item:${numberField(line, "voucherItemId")}`])),
    ...relevantPayments.flatMap((row) => arrayRecords(row.allocations).flatMap((allocation) => numberField(allocation, "voucherItemId") == null ? [] : [`finance-voucher-item:${numberField(allocation, "voucherItemId")}`])),
  ];
  const ready = registrationIds.length > 0 && readyRegistrationIds.length === registrationIds.length;
  const blockers = relevantBlockers.map(blocker);
  return result(
    blockers.length ? "blocked" : ready ? "ready" : "pending",
    "tax-accrual-close-v2",
    link("/finance/tax?view=accrual", scope),
    payload,
    blockers,
    evidenceRefs,
    voucherRefs,
  );
}

function taxWorkpaperHasCompleteEvidence(row: Record<string, unknown>) {
  const lines = arrayRecords(row.accrualLines);
  return stringField(row, "status") === "reconciled"
    && numberField(row, "sourceReportedAmount") != null
    && Math.abs(numberField(row, "sourceDifference") ?? Number.POSITIVE_INFINITY) <= 0.01
    && lines.length > 0
    && lines.every((line) => numberField(line, "sourceReportedAmount") != null
      && Math.abs(numberField(line, "sourceDifference") ?? Number.POSITIVE_INFINITY) <= 0.01
      && (Math.abs(numberField(line, "calculatedAmount") ?? 0) <= 0.01 || numberField(line, "voucherItemId") != null));
}

function taxFilingHasCompleteEvidence(row: Record<string, unknown>) {
  const reconciliation = recordField(row, "reconciliation");
  if (!reconciliation) return false;
  const differences = ["calculatedToDeclaredDifference", "declaredToPayableDifference", "payableToPaidDifference"];
  return ["filed", "accepted", "amended"].includes(stringField(row, "status") ?? "")
    && numberField(reconciliation, "declaredAmount") != null
    && numberField(reconciliation, "payableAmount") != null
    && numberField(reconciliation, "paidAmount") != null
    && reconciliation.filingEvidenceComplete === true
    && reconciliation.paymentEvidenceComplete === true
    && differences.every((key) => Math.abs(numberField(reconciliation, key) ?? Number.POSITIVE_INFINITY) <= 0.01);
}

function taxCloseWorkpaperPayload(row: Record<string, unknown>) {
  return {
    id: numberField(row, "id"), registrationId: numberField(row, "registrationId"), status: stringField(row, "status"),
    calculatedAmount: numberField(row, "calculatedAmount"), sourceReportedAmount: numberField(row, "sourceReportedAmount"),
    sourceDifference: numberField(row, "sourceDifference"), evidenceComplete: taxWorkpaperHasCompleteEvidence(row),
  };
}

function taxCloseFilingPayload(row: Record<string, unknown>) {
  const reconciliation = recordField(row, "reconciliation");
  return {
    id: numberField(row, "id"), registrationId: numberField(row, "registrationId"), status: stringField(row, "status"),
    reconciliation, evidenceComplete: taxFilingHasCompleteEvidence(row),
  };
}

function recordField(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function arrayNumbers(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

export function buildDefaultFinanceCloseProviderRegistry(inventoryClosingContract?: InventoryClosingContract) {
  return buildFinanceCloseProviderRegistry({
    ...buildInventoryCloseProviders(inventoryClosingContract),
    "finance.treasury.receipts": treasuryReceiptsCloseProvider,
    "finance.treasury.reconciliation": treasuryReconciliation,
    "finance.treasury.interest": treasuryInterest,
    "finance.tax.accrual": taxAccrual,
    ...FINANCE_ASSET_CLOSE_PROVIDERS,
    ...buildLedgerStatementFinanceCloseProviderFragment(),
  });
}
