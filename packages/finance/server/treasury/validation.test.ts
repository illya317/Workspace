import assert from "node:assert/strict";
import test from "node:test";

import type {
  BankReconciliationWriteInput,
  InterestWorkpaperWriteInput,
  LoanWriteInput,
  PrincipalEventAppendInput,
  TreasuryUpdateInput,
} from "../../types/treasury";
import { calculateBankReconciliation, calculateInterestWorkpaper, calculateLoanPrincipalBalance } from "./calculations";
import { resolveUniqueLoanDayCountConvention } from "./conventions";
import { treasuryCreateSchema } from "./schemas";
import { buildTreasuryCreateCommand, buildTreasuryUpdateCommand, principalEventMatchesInput } from "./validation";
import { buildTreasuryBlockers } from "./workspace-blockers";

const period = {
  id: 31,
  companyCode: "ZX02",
  year: 2026,
  month: 7,
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  isClosed: false,
};

const reconciliation: BankReconciliationWriteInput = {
  bankAccountId: 4,
  periodId: 31,
  companyCode: "ZX02",
  year: 2026,
  month: 7,
  statementDate: "2026-07-31",
  statementEndingBalance: 1_000,
  ledgerEndingBalance: 970,
  status: "prepared",
  items: [{
    id: 11,
    version: 2,
    voucherItemId: 90,
    itemKind: "ledger_adjustment",
    occurredOn: "2026-07-30",
    description: "银行已付、企业未记",
    amount: 30,
    status: "open",
  }],
};

test("builds a reconciliation update only when period, FKs, child ownership and CAS versions agree", async () => {
  const input: TreasuryUpdateInput = { kind: "bank_reconciliation_update", id: 8, version: 3, ...reconciliation };
  const result = await buildTreasuryUpdateCommand(input, 7, {
    findPeriod: async () => period,
    findBankAccount: async () => ({ id: 4, companyId: 2, companyCode: "ZX02", version: 1 }),
    findReconciliation: async () => ({ id: 8, bankAccountId: 4, periodId: 31, version: 3 }),
    findReconciliationItems: async () => [{ id: 11, parentId: 8, version: 2 }],
    findVoucherItems: async () => [{ id: 90, companyCode: "ZX02", periodId: 31 }],
  });
  assert.equal(result.ok, true);
});

test("rejects a stale reconciliation CAS version before persistence", async () => {
  const input: TreasuryUpdateInput = { kind: "bank_reconciliation_update", id: 8, version: 2, ...reconciliation };
  const result = await buildTreasuryUpdateCommand(input, 7, {
    findPeriod: async () => period,
    findBankAccount: async () => ({ id: 4, companyId: 2, companyCode: "ZX02", version: 1 }),
    findReconciliation: async () => ({ id: 8, bankAccountId: 4, periodId: 31, version: 3 }),
    findVoucherItems: async () => [{ id: 90, companyCode: "ZX02", periodId: 31 }],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "version");
  assert.equal(result.issue.status, 409);
});

test("rejects reconciling a bank workpaper while its derived difference exceeds tolerance", async () => {
  const input: TreasuryUpdateInput = {
    kind: "bank_reconciliation_update",
    id: 8,
    version: 3,
    ...reconciliation,
    status: "reconciled",
    items: [{ ...reconciliation.items[0], amount: 20 }],
  };
  const result = await buildTreasuryUpdateCommand(input, 7, {
    findPeriod: async () => period,
    findBankAccount: async () => ({ id: 4, companyId: 2, companyCode: "ZX02", version: 1 }),
    findReconciliation: async () => ({ id: 8, bankAccountId: 4, periodId: 31, version: 3 }),
    findReconciliationItems: async () => [{ id: 11, parentId: 8, version: 2 }],
    findVoucherItems: async () => [{ id: 90, companyCode: "ZX02", periodId: 31 }],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "status");
});

const loan: LoanWriteInput = {
  companyCode: "ZX02",
  lenderPartyId: 5,
  identityKey: "loan:zx02:2026:001",
  loanNo: "JK-2026-001",
  name: "流动资金借款",
  currencyCode: "CNY",
  contractPrincipalAmount: 1_000_000,
  startOn: "2026-01-01",
  endOn: "2026-12-31",
  status: "active",
  rateTerms: [{
    effectiveFrom: "2026-01-01",
    effectiveThrough: "2026-06-30",
    annualRate: 0.04,
    rateKind: "fixed",
    dayCountConvention: "actual_365",
  }, {
    effectiveFrom: "2026-07-01",
    effectiveThrough: "2026-12-31",
    annualRate: 0.045,
    rateKind: "fixed",
    dayCountConvention: "actual_365",
  }],
};

test("accepts non-overlapping versioned loan rate terms with owned company and lender", async () => {
  const parsed = treasuryCreateSchema.safeParse({ kind: "loan_create", ...loan });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal("companyId" in parsed.data, false);
  const result = await buildTreasuryCreateCommand({ kind: "loan_create", ...loan }, 7, {
    findCompanyByCode: async () => ({ id: 2, code: "ZX02", isActive: true }),
    findParty: async () => ({ id: 5 }),
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.companyId, 2);
});

test("rejects overlapping loan rate terms", async () => {
  const result = await buildTreasuryCreateCommand({
    kind: "loan_create",
    ...loan,
    rateTerms: [loan.rateTerms[0], { ...loan.rateTerms[1], effectiveFrom: "2026-06-30" }],
  }, 7, {
    findCompanyByCode: async () => ({ id: 2, code: "ZX02", isActive: true }),
    findParty: async () => ({ id: 5 }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "rateTerms");
});

const principalEvent: PrincipalEventAppendInput = {
  loanId: 20,
  companyCode: "ZX02",
  year: 2026,
  month: 7,
  periodId: 31,
  voucherItemId: 90,
  eventKind: "drawdown",
  occurredOn: "2026-07-10",
  amount: 500_000,
  idempotencyKey: "principal-event-0001",
};

const principalLoan = {
  id: 20,
  companyId: 2,
  companyCode: "ZX02",
  startOn: new Date("2026-01-01Z"),
  endOn: null,
  version: 1,
  rateTermConventions: ["actual_365" as const],
};

const principalEventDependencies = {
  findPeriod: async () => period,
  findLoan: async () => principalLoan,
  findVoucherItems: async () => [{ id: 90, companyCode: "ZX02", periodId: 31 }],
  findPrincipalEventByIdempotencyKey: async () => null,
};

test("accepts a principal event in the exact open period with a period-owned voucher", async () => {
  assert.equal(treasuryCreateSchema.safeParse({ kind: "principal_event_append", ...principalEvent }).success, true);
  assert.equal(treasuryCreateSchema.safeParse({ kind: "principal_event_append", ...principalEvent, periodId: undefined }).success, false);
  const result = await buildTreasuryCreateCommand(
    { kind: "principal_event_append", ...principalEvent },
    7,
    principalEventDependencies,
  );
  assert.equal(result.ok, true);
});

test("rejects a principal event in a closed period", async () => {
  const result = await buildTreasuryCreateCommand({ kind: "principal_event_append", ...principalEvent }, 7, {
    findPeriod: async () => ({ ...period, isClosed: true }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "periodId");
  assert.equal(result.issue.status, 409);
});

test("rejects a principal-event voucher from another accounting period", async () => {
  const result = await buildTreasuryCreateCommand({ kind: "principal_event_append", ...principalEvent }, 7, {
    ...principalEventDependencies,
    findVoucherItems: async () => [{ id: 90, companyCode: "ZX02", periodId: 30 }],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "voucherItemId");
});

test("rejects a principal-event date outside the selected accounting period", async () => {
  const result = await buildTreasuryCreateCommand({
    kind: "principal_event_append",
    ...principalEvent,
    occurredOn: "2026-06-30",
  }, 7, principalEventDependencies);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "occurredOn");
});

test("rejects a principal-event date outside the loan contract range", async () => {
  const result = await buildTreasuryCreateCommand({ kind: "principal_event_append", ...principalEvent }, 7, {
    ...principalEventDependencies,
    findLoan: async () => ({ ...principalLoan, startOn: new Date("2026-07-15Z") }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "occurredOn");
});

test("returns an existing principal event for an identical idempotent append", async () => {
  const result = await buildTreasuryCreateCommand({ kind: "principal_event_append", ...principalEvent }, 7, {
    ...principalEventDependencies,
    findPrincipalEventByIdempotencyKey: async () => ({
      id: 77,
      loanId: 20,
      voucherItemId: 90,
      eventKind: "drawdown",
      occurredOn: new Date("2026-07-10Z"),
      amount: 500_000,
      reversesEventId: null,
      idempotencyKey: "principal-event-0001",
    }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.idempotentPrincipalEventId, 77);
});

test("rejects a mismatched payload reusing a principal-event idempotency key", async () => {
  const result = await buildTreasuryCreateCommand({ kind: "principal_event_append", ...principalEvent, amount: 600_000 }, 7, {
    ...principalEventDependencies,
    findPrincipalEventByIdempotencyKey: async () => ({
      id: 77,
      loanId: 20,
      voucherItemId: 90,
      eventKind: "drawdown",
      occurredOn: new Date("2026-07-10Z"),
      amount: 500_000,
      reversesEventId: null,
      idempotencyKey: "principal-event-0001",
    }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "idempotencyKey");
});

const workpaper: InterestWorkpaperWriteInput = {
  loanId: 20,
  periodId: 31,
  companyCode: "ZX02",
  year: 2026,
  month: 7,
  status: "prepared",
  dayCountConvention: "actual_365",
  lines: [{
    lineNo: 1,
    accrualFrom: "2026-07-01",
    accrualThrough: "2026-07-31",
    principalBasis: 500_000,
    annualRate: 0.04,
    dayCount: 31,
  }],
  voucherLinks: [],
};

test("validates interest day count against period dates and convention", async () => {
  const deps = {
    findPeriod: async () => period,
    findLoan: async () => ({ id: 20, companyId: 2, companyCode: "ZX02", startOn: new Date("2026-01-01Z"), endOn: null, version: 1, rateTermConventions: ["actual_365"] }),
    findVoucherItems: async () => [],
  };
  const accepted = await buildTreasuryCreateCommand({ kind: "interest_workpaper_create", ...workpaper }, 7, deps);
  assert.equal(accepted.ok, true);
  const rejected = await buildTreasuryCreateCommand({
    kind: "interest_workpaper_create",
    ...workpaper,
    lines: [{ ...workpaper.lines[0], dayCount: 30 }],
  }, 7, deps);
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.equal(rejected.issue.field, "dayCount");
});

test("fails closed when loan conventions are absent, mixed or different from the workpaper", async () => {
  assert.equal(resolveUniqueLoanDayCountConvention([]), null);
  assert.equal(resolveUniqueLoanDayCountConvention(["actual_365", "actual_360"]), null);
  assert.equal(resolveUniqueLoanDayCountConvention(["actual_360"]), "actual_360");
  const result = await buildTreasuryCreateCommand({ kind: "interest_workpaper_create", ...workpaper }, 7, {
    findPeriod: async () => period,
    findLoan: async () => ({
      id: 20,
      companyId: 2,
      companyCode: "ZX02",
      startOn: new Date("2026-01-01Z"),
      endOn: null,
      version: 1,
      rateTermConventions: ["actual_365", "actual_360"],
    }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "dayCountConvention");
});

test("derives the canonical interest calculation version and fingerprint on the server", async () => {
  assert.equal(treasuryCreateSchema.safeParse({ kind: "interest_workpaper_create", ...workpaper }).success, true);
  const result = await buildTreasuryCreateCommand({
    kind: "interest_workpaper_create",
    ...workpaper,
  }, 7, {
    findPeriod: async () => period,
    findLoan: async () => ({ id: 20, companyId: 2, companyCode: "ZX02", startOn: new Date("2026-01-01Z"), endOn: null, version: 1, rateTermConventions: ["actual_365"] }),
    findVoucherItems: async () => [],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.calculation?.calculationVersion, "treasury-v1");
  assert.match(result.data.calculation?.inputFingerprint ?? "", /^[a-f0-9]{64}$/);
});

test("rejects reconciling interest with source or voucher differences", async () => {
  const deps = {
    findPeriod: async () => period,
    findLoan: async () => ({ id: 20, companyId: 2, companyCode: "ZX02", startOn: new Date("2026-01-01Z"), endOn: null, version: 1, rateTermConventions: ["actual_365" as const] }),
    findVoucherItems: async () => [{ id: 91, companyCode: "ZX02", periodId: 31 }],
  };
  const sourceDifference = await buildTreasuryCreateCommand({
    kind: "interest_workpaper_create",
    ...workpaper,
    status: "reconciled",
    lines: [{ ...workpaper.lines[0], sourceReportedInterestAmount: 1_600 }],
    voucherLinks: [{ voucherItemId: 91, linkKind: "accrual", amount: 1_698.63 }],
  }, 7, deps);
  assert.equal(sourceDifference.ok, false);
  const voucherDifference = await buildTreasuryCreateCommand({
    kind: "interest_workpaper_create",
    ...workpaper,
    status: "reconciled",
    voucherLinks: [{ voucherItemId: 91, linkKind: "accrual", amount: 1_600 }],
  }, 7, deps);
  assert.equal(voucherDifference.ok, false);
});

test("principal idempotency matching includes mutable evidence fields", () => {
  const existing = {
    id: 77,
    loanId: 20,
    voucherItemId: 90,
    eventKind: "drawdown",
    occurredOn: new Date("2026-07-10Z"),
    amount: 500_000,
    referenceNo: null,
    note: null,
    reversesEventId: null,
    idempotencyKey: principalEvent.idempotencyKey,
  };
  assert.equal(principalEventMatchesInput(existing, principalEvent), true);
  assert.equal(principalEventMatchesInput({ ...existing, note: "different" }, principalEvent), false);
});

test("workspace blockers include missing periods and interest source differences", () => {
  const blockers = buildTreasuryBlockers(
    { companyCode: "ZX02", year: 2026, month: 7 },
    false,
    [],
    [{ id: 9, calculation: { voucherDifference: 0, sourceDifference: 12.34 } } as never],
  );
  assert.deepEqual(blockers.map((item) => item.code), ["treasury_period_missing", "interest_source_difference"]);
});

test("derives reconciliation, interest and outstanding principal results", () => {
  assert.deepEqual(calculateBankReconciliation({
    statementEndingBalance: 1_000,
    ledgerEndingBalance: 970,
    items: [{ itemKind: "ledger_adjustment", amount: 30, status: "open" }],
  }), {
    bankAdjustments: 0,
    ledgerAdjustments: 30,
    adjustedBankBalance: 1_000,
    adjustedLedgerBalance: 1_000,
    difference: 0,
  });
  assert.equal(calculateInterestWorkpaper({
    dayCountConvention: "actual_365",
    lines: [{ principalBasis: 365_000, annualRate: 0.04, dayCount: 31 }],
    voucherLinks: [{ linkKind: "accrual", amount: 1_200 }],
  }).voucherDifference, 40);
  assert.equal(calculateLoanPrincipalBalance([
    { id: 1, eventKind: "drawdown", amount: 500_000 },
    { id: 2, eventKind: "repayment", amount: 100_000 },
    { id: 3, eventKind: "reversal", amount: 100_000, reversesEventId: 2 },
  ]), 500_000);
});
