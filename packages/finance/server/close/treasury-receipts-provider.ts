import type { FinanceCloseBlockerDto, FinanceCloseProvider, FinanceCloseProviderInspection, FinanceCloseScope } from "../../types/close";
import type { TreasuryBankReconciliationDto, TreasuryWorkspaceDto } from "../../types/treasury";
import { listTreasuryWorkspace } from "../treasury/service";
import { financeCloseInspectionFingerprint } from "./inspection-identity";
import { bankAccountAppliesToClosePeriod, financeClosePeriodBounds } from "./treasury-period-scope";

const unique = (values: string[]) => [...new Set(values)].sort();
const deepLink = (scope: FinanceCloseScope) => `/finance/treasury?view=bank-reconciliation&companyCode=${encodeURIComponent(scope.companyCode)}&year=${scope.year}&month=${scope.month}`;

function governedStatementEvidence(row: TreasuryBankReconciliationDto) {
  if (row.evidenceRef?.trim()) return { kind: "evidence_ref", reference: row.evidenceRef.trim() } as const;
  if (row.sourceKind?.trim() && row.sourceSha256?.trim() && (row.sourceReleaseId?.trim() || row.sourceFile?.trim())) {
    return {
      kind: "source_trace",
      reference: row.sourceReleaseId?.trim() || row.sourceFile?.trim() || row.sourceKey?.trim() || `reconciliation:${row.id}`,
    } as const;
  }
  return null;
}

export function inspectTreasuryReceiptsWorkspace(
  scope: FinanceCloseScope,
  workspace: TreasuryWorkspaceDto,
): FinanceCloseProviderInspection {
  const target = deepLink(scope);
  const periodBlockers = workspace.blockers.filter((item) => item.code === "treasury_period_missing").map((item): FinanceCloseBlockerDto => ({
    code: item.code,
    message: item.message,
    deepLink: item.deepLink,
  }));
  const accounts = workspace.bankAccounts.filter((row) => bankAccountAppliesToClosePeriod(row, scope));
  const accountIds = new Set(accounts.map((row) => row.id));
  const reconciliations = workspace.bankReconciliations.filter((row) => accountIds.has(row.bankAccountId));
  const periodEnd = financeClosePeriodBounds(scope).end;
  const rows = accounts.map((account) => {
    const reconciliation = reconciliations.find((row) => row.bankAccountId === account.id) ?? null;
    const expectedThrough = account.closedOn && account.closedOn < periodEnd ? account.closedOn : periodEnd;
    const evidence = reconciliation ? governedStatementEvidence(reconciliation) : null;
    return {
      bankAccountId: account.id,
      reconciliationId: reconciliation?.id ?? null,
      statementDate: reconciliation?.statementDate ?? null,
      expectedThrough,
      evidenceKind: evidence?.kind ?? null,
      evidenceReference: evidence?.reference ?? null,
      receiptComplete: Boolean(reconciliation && evidence && reconciliation.statementDate >= expectedThrough),
    };
  });
  const applicable = accounts.length > 0;
  const missingAccountIds = rows.filter((row) => row.reconciliationId == null).map((row) => row.bankAccountId);
  const missingEvidenceReconciliationIds = rows.filter((row) => row.reconciliationId != null && row.evidenceKind == null).map((row) => row.reconciliationId!);
  const incompleteCutoffReconciliationIds = rows.filter((row) => row.reconciliationId != null && row.statementDate != null && row.statementDate < row.expectedThrough).map((row) => row.reconciliationId!);
  const payload = {
    periodId: workspace.scope.periodId,
    applicable,
    accountIds: accounts.map((row) => row.id).sort((a, b) => a - b),
    rows,
    missingAccountIds,
    missingEvidenceReconciliationIds,
    incompleteCutoffReconciliationIds,
  };
  const ready = !applicable || rows.every((row) => row.receiptComplete);
  const status = periodBlockers.length ? "blocked" : ready ? "ready" : "pending";
  const evidenceRefs = unique(reconciliations.map((row) => `finance-bank-reconciliation:${row.id}`));
  const voucherRefs: string[] = [];
  return {
    status,
    contributorVersion: "treasury-receipts-close-v2",
    inputFingerprint: financeCloseInspectionFingerprint({ status, blockers: periodBlockers, evidenceRefs, voucherRefs, deepLink: target, payload }),
    blockers: periodBlockers,
    evidenceRefs,
    voucherRefs,
    deepLink: target,
    payload,
  };
}

export const treasuryReceiptsCloseProvider: FinanceCloseProvider = {
  inspectPeriodClose: async (scope) => inspectTreasuryReceiptsWorkspace(scope, await listTreasuryWorkspace(scope)),
};
