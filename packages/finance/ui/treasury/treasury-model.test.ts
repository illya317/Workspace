import assert from "node:assert/strict";
import test from "node:test";
import type {
  TreasuryBankReconciliationDto,
  TreasuryInterestWorkpaperDto,
  TreasuryLoanDto,
} from "../../types/treasury";
import {
  canAppendPrincipalEvent,
  canSaveInterest,
  editInterestDraft,
  editReconciliationDraft,
  emptyBankAccountDraft,
  emptyPrincipalEventDraft,
  isTreasuryView,
  periodEnd,
  uniqueLoanConvention,
} from "./treasury-model";

const trace = {
  sourceKind: "xlsx",
  sourceReleaseId: "release-1",
  sourceSha256: "a".repeat(64),
  sourceFile: "source.xlsx",
  sourceSheet: "Sheet1",
  sourceRow: 7,
  sourceRange: "A7:H7",
  sourceKey: "source-row-7",
};

test("Treasury view keys and month end remain stable", () => {
  assert.equal(isTreasuryView("bank-reconciliation"), true);
  assert.equal(isTreasuryView("banking"), false);
  assert.equal(periodEnd({ companyCode: "C1", year: 2028, month: 2 }), "2028-02-29");
});

test("manual bank-account draft uses selected scope without database-only company id", () => {
  const draft = emptyBankAccountDraft({ companyCode: "C1", year: 2026, month: 7 }, "token-123");
  assert.equal(draft.companyCode, "C1");
  assert.equal(draft.accountYear, 2026);
  assert.equal(draft.sourceKey, "bank-account:C1:token-123");
  assert.equal("companyId" in draft, false);
});

test("reconciliation edit draft preserves parent and child lineage plus concurrency versions", () => {
  const row = {
    ...trace,
    id: 11,
    version: 4,
    bankAccountId: 3,
    periodId: 9,
    statementDate: "2026-07-31",
    statementEndingBalance: 100,
    ledgerEndingBalance: 95,
    status: "prepared",
    conclusion: "待核对",
    evidenceRef: "evidence:1",
    calculation: { bankAdjustments: 0, ledgerAdjustments: 0, adjustedBankBalance: 100, adjustedLedgerBalance: 95, difference: 5 },
    items: [{
      ...trace,
      id: 21,
      version: 2,
      voucherItemId: 31,
      itemKind: "ledger_adjustment",
      occurredOn: "2026-07-30",
      referenceNo: "R-1",
      description: "在途",
      amount: 5,
      clearedOn: null,
      status: "review",
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    }],
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  } satisfies TreasuryBankReconciliationDto;
  const draft = editReconciliationDraft({ companyCode: "C1", year: 2026, month: 7, periodId: 9, isClosed: false }, row);
  assert.equal(draft.sourceFile, "source.xlsx");
  assert.equal(draft.items[0].id, 21);
  assert.equal(draft.items[0].version, 2);
  assert.equal(draft.items[0].sourceRange, "A7:H7");
});

test("loan convention must be unique before preparing an interest workpaper", () => {
  const loan = loanFixture();
  assert.equal(uniqueLoanConvention(loan), "actual_365");
  loan.rateTerms.push({ ...loan.rateTerms[0], id: 2, dayCountConvention: "actual_360" });
  assert.equal(uniqueLoanConvention(loan), null);
});

test("principal events are disabled without an open selected period", () => {
  const draft = {
    companyCode: "C1",
    year: 2026,
    month: 7,
    periodId: 9,
    loanId: 1,
    eventKind: "drawdown" as const,
    occurredOn: "2026-07-31",
    amount: 100,
    idempotencyKey: "principal-event:C1:1",
  };
  assert.equal(canAppendPrincipalEvent({ companyCode: "C1", year: 2026, month: 7, periodId: null, isClosed: false }, draft), false);
  assert.equal(canAppendPrincipalEvent({ companyCode: "C1", year: 2026, month: 7, periodId: 9, isClosed: true }, draft), false);
  assert.equal(canAppendPrincipalEvent({ companyCode: "C1", year: 2026, month: 7, periodId: 9, isClosed: false }, draft), true);
});

test("principal-event drafts preserve the selected accounting-period scope", () => {
  const draft = emptyPrincipalEventDraft(
    { companyCode: "C1", year: 2026, month: 7, periodId: 9, isClosed: false },
    20,
    "token",
  );
  assert.deepEqual(
    { companyCode: draft.companyCode, year: draft.year, month: draft.month, periodId: draft.periodId },
    { companyCode: "C1", year: 2026, month: 7, periodId: 9 },
  );
});

test("interest edit draft omits server-owned evidence fields and preserves child ids", () => {
  const row = {
    ...trace,
    id: 41,
    version: 3,
    loanId: 5,
    periodId: 9,
    status: "prepared",
    calculationVersion: "treasury-v1",
    inputFingerprint: "fingerprint",
    dayCountConvention: "actual_365",
    note: null,
    lines: [{
      ...trace,
      id: 51,
      lineNo: 1,
      accrualFrom: "2026-07-01",
      accrualThrough: "2026-07-31",
      principalBasis: 1000,
      annualRate: 0.05,
      dayCount: 31,
      sourceReportedInterestAmount: 4.25,
      calculatedAmount: 4.25,
      sourceDifference: 0,
      note: null,
      createdAt: "2026-07-31T00:00:00.000Z",
    }],
    voucherLinks: [],
    calculation: { calculatedAmount: 4.25, sourceReportedAmount: 4.25, sourceDifference: 0, voucherAmount: 0, voucherDifference: 4.25 },
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  } satisfies TreasuryInterestWorkpaperDto;
  const draft = editInterestDraft({ companyCode: "C1", year: 2026, month: 7, periodId: 9, isClosed: false }, row);
  assert.equal("calculationVersion" in draft, false);
  assert.equal("inputFingerprint" in draft, false);
  assert.equal(draft.lines[0].id, 51);
  assert.equal(canSaveInterest(draft), true);
});

function loanFixture(): TreasuryLoanDto {
  return {
    ...trace,
    id: 1,
    version: 1,
    companyId: 2,
    companyCode: "C1",
    lenderPartyId: 3,
    identityKey: "loan-1",
    loanNo: "L-1",
    name: "流动资金借款",
    currencyCode: "CNY",
    contractPrincipalAmount: 1000,
    principalBalance: 1000,
    startOn: "2026-01-01",
    endOn: null,
    status: "active",
    note: null,
    rateTerms: [{
      ...trace,
      id: 1,
      effectiveFrom: "2026-01-01",
      effectiveThrough: null,
      annualRate: 0.05,
      spreadRate: null,
      rateKind: "fixed",
      benchmark: null,
      dayCountConvention: "actual_365",
      createdAt: "2026-01-01T00:00:00.000Z",
    }],
    principalEvents: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
