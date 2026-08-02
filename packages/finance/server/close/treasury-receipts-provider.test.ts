import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type {
  TreasuryBankAccountDto,
  TreasuryBankReconciliationDto,
  TreasuryWorkspaceDto,
} from "../../types/treasury";

mock.module("server-only", { namedExports: {} } as never);

const { inspectTreasuryReceiptsWorkspace } = await import("./treasury-receipts-provider");

const scope = { companyCode: "C01", year: 2026, month: 6 };
const trace = {
  sourceKind: null,
  sourceReleaseId: null,
  sourceSha256: null,
  sourceFile: null,
  sourceSheet: null,
  sourceRow: null,
  sourceRange: null,
  sourceKey: null,
};

function bankAccount(overrides: Partial<TreasuryBankAccountDto> = {}): TreasuryBankAccountDto {
  return {
    id: 1,
    version: 1,
    ...trace,
    companyId: 1,
    companyCode: "C01",
    accountId: 1,
    accountYear: 2026,
    accountCode: "1002",
    accountName: "银行存款",
    sourceSystem: "workspace",
    sourceLedger: "treasury",
    sourceKey: "bank:1",
    sourceCode: null,
    sourceName: "基本户",
    accountNo: "001",
    bankName: "测试银行",
    currencyCode: "CNY",
    openedOn: "2025-01-01",
    closedOn: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function reconciliation(overrides: Partial<TreasuryBankReconciliationDto> = {}): TreasuryBankReconciliationDto {
  return {
    id: 2,
    version: 1,
    bankAccountId: 1,
    periodId: 6,
    statementDate: "2026-06-30",
    statementEndingBalance: 100,
    ledgerEndingBalance: 80,
    status: "draft",
    conclusion: null,
    evidenceRef: "evidence://bank/statement-2",
    items: [],
    calculation: { bankAdjustments: 0, ledgerAdjustments: 0, adjustedBankBalance: 100, adjustedLedgerBalance: 80, difference: 20 },
    ...trace,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function workspace(overrides: Partial<TreasuryWorkspaceDto> = {}): TreasuryWorkspaceDto {
  return {
    scope: { ...scope, periodId: 6, isClosed: false },
    bankAccounts: [bankAccount()],
    bankReconciliations: [reconciliation()],
    loans: [],
    interestWorkpapers: [],
    blockers: [],
    evidenceRefs: [],
    ...overrides,
  };
}

test("bank receipts require period-cutoff evidence for every applicable account", () => {
  const ready = inspectTreasuryReceiptsWorkspace(scope, workspace());
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.evidenceRefs, ["finance-bank-reconciliation:2"]);

  const missingEvidence = inspectTreasuryReceiptsWorkspace(scope, workspace({
    bankReconciliations: [reconciliation({ evidenceRef: null })],
  }));
  assert.equal(missingEvidence.status, "pending");
  assert.deepEqual((missingEvidence.payload as { missingEvidenceReconciliationIds: number[] }).missingEvidenceReconciliationIds, [2]);

  const earlyCutoff = inspectTreasuryReceiptsWorkspace(scope, workspace({
    bankReconciliations: [reconciliation({ statementDate: "2026-06-29" })],
  }));
  assert.equal(earlyCutoff.status, "pending");
});

test("governed source trace qualifies as statement evidence and reconciliation difference is a separate close task", () => {
  const inspection = inspectTreasuryReceiptsWorkspace(scope, workspace({
    bankReconciliations: [reconciliation({
      evidenceRef: null,
      sourceKind: "controlled_import",
      sourceReleaseId: "release-1",
      sourceSha256: "a".repeat(64),
      sourceFile: "statement.xlsx",
    })],
    blockers: [{
      code: "bank_reconciliation_difference",
      message: "差额 20",
      entityKind: "bank_reconciliation",
      entityId: 2,
      deepLink: "/finance/treasury",
    }],
  }));
  assert.equal(inspection.status, "ready");
});

test("no applicable bank account is explicit ready, while a missing Finance period blocks inspection", () => {
  const notApplicable = inspectTreasuryReceiptsWorkspace(scope, workspace({ bankAccounts: [], bankReconciliations: [] }));
  assert.equal(notApplicable.status, "ready");
  assert.equal((notApplicable.payload as { applicable: boolean }).applicable, false);

  const missingPeriod = inspectTreasuryReceiptsWorkspace(scope, workspace({
    scope: { ...scope, periodId: null, isClosed: false },
    blockers: [{ code: "treasury_period_missing", message: "期间不存在", entityKind: "scope", entityId: null, deepLink: "/finance/treasury" }],
  }));
  assert.equal(missingPeriod.status, "blocked");
});
