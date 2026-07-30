import assert from "node:assert/strict";
import test from "node:test";

import type { TaxCreateInput, TaxUpdateInput } from "../../types/tax";
import { calculateTaxAccrualLine, calculateTaxPaidByFilingAsOf } from "./calculations";
import { taxCreateSchema, taxUpdateSchema } from "./schemas";
import {
  buildTaxCreateCommand,
  buildTaxUpdateCommand,
  type TaxValidationDependencies,
} from "./validation";

function dependencies(overrides: Partial<TaxValidationDependencies> = {}): TaxValidationDependencies {
  return {
    findCompanyByCode: async (code) => ({ id: 2, code, isActive: true }),
    findPeriod: async (id) => ({ id, companyCode: "ZX02", year: 2026, month: 6, isClosed: false }),
    findTaxType: async (id) => ({ id, isActive: true }),
    findRegistration: async (id) => ({
      id,
      companyCode: "ZX02",
      version: 2,
      status: "active",
      effectiveFrom: "2026-01-01",
      effectiveThrough: null,
    }),
    findWorkpaper: async (id) => ({ id, companyCode: "ZX02", version: 2, status: "draft" }),
    findFiling: async (id) => ({ id, companyCode: "ZX02", version: 2, status: "filed", currencyCode: "CNY" }),
    findFilings: async (ids) => ids.map((id) => ({ id, companyCode: "ZX02", version: 1, status: "filed", currencyCode: "CNY" })),
    findAccrualLines: async (ids) => ids.map((id) => ({ id, workpaperId: 22 })),
    findVoucherItems: async (ids) => ids.map((id) => ({ id, companyCode: "ZX02", periodId: 6, year: 2026, month: 6 })),
    findPaymentByIdempotencyKey: async () => null,
    findPayment: async (id) => ({
      id,
      companyCode: "ZX02",
      paymentKind: "payment",
      paidOn: "2026-06-20",
      amount: 60,
      currencyCode: "CNY",
      paymentReference: null,
      note: null,
      reversesPaymentId: null,
      sourceKind: null,
      sourceReleaseId: null,
      sourceSha256: null,
      sourceFile: null,
      sourceSheet: null,
      sourceRow: null,
      sourceRange: null,
      sourceKey: null,
      allocations: [],
    }),
    paymentWasReversed: async () => false,
    filingHasAllocations: async () => false,
    ...overrides,
  };
}

const workpaper: Extract<TaxCreateInput, { kind: "workpaper_create" }> = {
  kind: "workpaper_create",
  registrationId: 8,
  periodId: 6,
  companyCode: "ZX02",
  year: 2026,
  month: 6,
  status: "prepared",
  accrualLines: [{
    lineNo: 1,
    voucherItemId: 101,
    description: "增值税计提",
    taxBaseAmount: 1000,
    taxRate: 0.06,
    sourceReportedTaxAmount: 60,
  }],
};

test("accepts exactly one calculation method and computes source differences", async () => {
  const calculated = calculateTaxAccrualLine(workpaper.accrualLines[0]);
  assert.deepEqual(calculated, {
    method: "base_rate",
    calculatedAmount: 60,
    sourceReportedAmount: 60,
    sourceDifference: 0,
  });
  const result = await buildTaxCreateCommand(workpaper, 7, dependencies());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.calculation?.calculationVersion, "tax-v1");
  assert.match(result.data.calculation?.inputFingerprint ?? "", /^[a-f0-9]{64}$/);
});

test("rejects mixed calculation methods", async () => {
  const result = await buildTaxCreateCommand({
    ...workpaper,
    accrualLines: [{ ...workpaper.accrualLines[0], quantity: 3, unitRate: 2, divisor: 1 }],
  }, 7, dependencies());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "accrualLines");
});

test("rejects a registration outside the requested period", async () => {
  const result = await buildTaxCreateCommand(workpaper, 7, dependencies({
    findRegistration: async (id) => ({
      id,
      companyCode: "ZX02",
      version: 1,
      status: "active",
      effectiveFrom: "2026-07-01",
      effectiveThrough: null,
    }),
  }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "registrationId");
});

test("accepts historical ended registrations only when their dated interval covers the period", async () => {
  const endedInPeriod = await buildTaxCreateCommand(workpaper, 7, dependencies({
    findRegistration: async (id) => ({
      id, companyCode: "ZX02", version: 1, status: "ended",
      effectiveFrom: "2025-01-01", effectiveThrough: "2026-06-30",
    }),
  }));
  assert.equal(endedInPeriod.ok, true);

  const endedBeforePeriod = await buildTaxCreateCommand(workpaper, 7, dependencies({
    findRegistration: async (id) => ({
      id, companyCode: "ZX02", version: 1, status: "ended",
      effectiveFrom: "2025-01-01", effectiveThrough: "2026-05-31",
    }),
  }));
  assert.equal(endedBeforePeriod.ok, false);
  if (!endedBeforePeriod.ok) assert.equal(endedBeforePeriod.issue.field, "registrationId");
});

test("fails closed for suspended and unbounded ended registrations", async () => {
  for (const status of ["suspended", "ended"] as const) {
    const result = await buildTaxCreateCommand(workpaper, 7, dependencies({
      findRegistration: async (id) => ({
        id, companyCode: "ZX02", version: 1, status,
        effectiveFrom: "2025-01-01", effectiveThrough: null,
      }),
    }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issue.field, "registrationId");
  }
});

test("validates real registration and accrual recognition dates in the domain layer", async () => {
  const registration: Extract<TaxCreateInput, { kind: "registration_create" }> = {
    kind: "registration_create",
    companyCode: "ZX02",
    taxTypeId: 1,
    registrationNo: "TAX-1",
    jurisdiction: "CN",
    filingFrequency: "monthly",
    effectiveFrom: "2026-02-30",
    status: "active",
  };
  const invalidEffectiveDate = await buildTaxCreateCommand(registration, 7, dependencies());
  assert.equal(invalidEffectiveDate.ok, false);
  if (!invalidEffectiveDate.ok) assert.equal(invalidEffectiveDate.issue.field, "effectiveFrom");

  const accepted = await buildTaxCreateCommand({ ...registration, effectiveFrom: "2026-02-28" }, 7, dependencies());
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.data.companyId, 2);

  const missingCompany = await buildTaxCreateCommand({ ...registration, effectiveFrom: "2026-02-28" }, 7, dependencies({
    findCompanyByCode: async () => null,
  }));
  assert.equal(missingCompany.ok, false);
  if (!missingCompany.ok) assert.equal(missingCompany.issue.field, "companyCode");

  const outsidePeriod = await buildTaxCreateCommand({
    ...workpaper,
    accrualLines: [{ ...workpaper.accrualLines[0], recognitionOn: "2026-07-01" }],
  }, 7, dependencies());
  assert.equal(outsidePeriod.ok, false);
  if (!outsidePeriod.ok) assert.equal(outsidePeriod.issue.field, "recognitionOn");

  const invalidRecognitionDate = await buildTaxCreateCommand({
    ...workpaper,
    accrualLines: [{ ...workpaper.accrualLines[0], recognitionOn: "2026-06-31" }],
  }, 7, dependencies());
  assert.equal(invalidRecognitionDate.ok, false);
  if (!invalidRecognitionDate.ok) assert.equal(invalidRecognitionDate.issue.field, "recognitionOn");
});

const payment: Extract<TaxCreateInput, { kind: "payment_append" }> = {
  kind: "payment_append",
  companyCode: "ZX02",
  paymentKind: "payment",
  paidOn: "2026-06-20",
  amount: 100,
  currencyCode: "CNY",
  idempotencyKey: "tax-payment-1",
  allocations: [
    { filingId: 10, voucherItemId: 201, allocatedAmount: 60 },
    { filingId: 11, voucherItemId: 202, allocatedAmount: 40 },
  ],
};

test("allows allocations across registrations when every filing belongs to the payment company", async () => {
  const result = await buildTaxCreateCommand(payment, 7, dependencies());
  assert.equal(result.ok, true);
});

test("rejects allocations above the payment amount and foreign voucher ownership", async () => {
  const excessive = await buildTaxCreateCommand({
    ...payment,
    amount: 99,
  }, 7, dependencies());
  assert.equal(excessive.ok, false);
  if (!excessive.ok) assert.equal(excessive.issue.field, "allocations");

  const foreignVoucher = await buildTaxCreateCommand(payment, 7, dependencies({
    findVoucherItems: async (ids) => ids.map((id) => ({ id, companyCode: "OTHER", periodId: 6, year: 2026, month: 6 })),
  }));
  assert.equal(foreignVoucher.ok, false);
  if (!foreignVoucher.ok) assert.equal(foreignVoucher.issue.field, "voucherItemId");
});

test("requires workpaper vouchers in the target period and payment vouchers in the paid-on period", async () => {
  const foreignPeriodWorkpaper = await buildTaxCreateCommand(workpaper, 7, dependencies({
    findVoucherItems: async (ids) => ids.map((id) => ({ id, companyCode: "ZX02", periodId: 5, year: 2026, month: 5 })),
  }));
  assert.equal(foreignPeriodWorkpaper.ok, false);
  if (!foreignPeriodWorkpaper.ok) assert.equal(foreignPeriodWorkpaper.issue.field, "voucherItemId");

  const foreignPeriodPayment = await buildTaxCreateCommand(payment, 7, dependencies({
    findVoucherItems: async (ids) => ids.map((id) => ({ id, companyCode: "ZX02", periodId: 7, year: 2026, month: 7 })),
  }));
  assert.equal(foreignPeriodPayment.ok, false);
  if (!foreignPeriodPayment.ok) assert.equal(foreignPeriodPayment.issue.field, "voucherItemId");
});

test("validates payment dates, positive amounts, currency, allocation amounts, and filing status in the domain layer", async () => {
  const invalidDate = await buildTaxCreateCommand({ ...payment, paidOn: "2026-06-31" }, 7, dependencies());
  assert.equal(invalidDate.ok, false);
  if (!invalidDate.ok) assert.equal(invalidDate.issue.field, "paidOn");

  const invalidAmount = await buildTaxCreateCommand({ ...payment, amount: 0 }, 7, dependencies());
  assert.equal(invalidAmount.ok, false);
  if (!invalidAmount.ok) assert.equal(invalidAmount.issue.field, "amount");

  const invalidCurrency = await buildTaxCreateCommand({ ...payment, currencyCode: "cny" }, 7, dependencies());
  assert.equal(invalidCurrency.ok, false);
  if (!invalidCurrency.ok) assert.equal(invalidCurrency.issue.field, "currencyCode");

  const invalidAllocation = await buildTaxCreateCommand({
    ...payment,
    allocations: [{ filingId: 10, allocatedAmount: 0 }],
  }, 7, dependencies());
  assert.equal(invalidAllocation.ok, false);
  if (!invalidAllocation.ok) assert.equal(invalidAllocation.issue.field, "allocations");

  const draftFiling = await buildTaxCreateCommand(payment, 7, dependencies({
    findFilings: async (ids) => ids.map((id) => ({ id, companyCode: "ZX02", version: 1, status: "draft", currencyCode: "CNY" })),
  }));
  assert.equal(draftFiling.ok, false);
  if (!draftFiling.ok) {
    assert.equal(draftFiling.issue.field, "allocations");
    assert.equal(draftFiling.issue.status, 409);
  }
});

test("validates filing date and currency in the domain layer", async () => {
  const filing: Extract<TaxCreateInput, { kind: "filing_create" }> = {
    kind: "filing_create",
    registrationId: 8,
    periodId: 6,
    companyCode: "ZX02",
    year: 2026,
    month: 6,
    filedOn: "2026-06-31",
    status: "filed",
    currencyCode: "CNY",
  };
  const invalidDate = await buildTaxCreateCommand(filing, 7, dependencies());
  assert.equal(invalidDate.ok, false);
  if (!invalidDate.ok) assert.equal(invalidDate.issue.field, "filedOn");

  const invalidCurrency = await buildTaxCreateCommand({ ...filing, filedOn: "2026-06-30", currencyCode: "RMB".slice(0, 2) }, 7, dependencies());
  assert.equal(invalidCurrency.ok, false);
  if (!invalidCurrency.ok) assert.equal(invalidCurrency.issue.field, "currencyCode");
});

test("returns an existing append only when the complete idempotent payload matches", async () => {
  const matching = dependencies({
    findPaymentByIdempotencyKey: async () => ({
      id: 77,
      companyCode: "ZX02",
      paymentKind: "payment",
      paidOn: "2026-06-20",
      amount: 100,
      currencyCode: "CNY",
      paymentReference: null,
      note: null,
      reversesPaymentId: null,
      sourceKind: null,
      sourceReleaseId: null,
      sourceSha256: null,
      sourceFile: null,
      sourceSheet: null,
      sourceRow: null,
      sourceRange: null,
      sourceKey: null,
      allocations: payment.allocations.map((item) => ({ ...item, voucherItemId: item.voucherItemId ?? null })),
    }),
  });
  const accepted = await buildTaxCreateCommand(payment, 7, matching);
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.data.idempotentRecordId, 77);

  const conflict = await buildTaxCreateCommand({ ...payment, amount: 101 }, 7, matching);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.issue.status, 409);
});

test("enforces CAS and child ownership on workpaper updates", async () => {
  const update: TaxUpdateInput = { ...workpaper, kind: "workpaper_update", id: 22, version: 2, accrualLines: [{ ...workpaper.accrualLines[0], id: 901 }] };
  const accepted = await buildTaxUpdateCommand(update, 7, dependencies());
  assert.equal(accepted.ok, true);

  const stale = await buildTaxUpdateCommand({ ...update, version: 1 }, 7, dependencies());
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.issue.field, "version");

  const foreignChild = await buildTaxUpdateCommand(update, 7, dependencies({
    findAccrualLines: async () => [{ id: 901, workpaperId: 999 }],
  }));
  assert.equal(foreignChild.ok, false);
  if (!foreignChild.ok) assert.equal(foreignChild.issue.field, "accrualLines");
});

test("keeps payments and reconciliation snapshots out of PUT commands", () => {
  const parsedPayment = taxCreateSchema.safeParse(payment);
  assert.equal(parsedPayment.success, true);
  if (parsedPayment.success) assert.equal("companyId" in parsedPayment.data, false);
  assert.equal(taxCreateSchema.safeParse(workpaper).success, true);
  assert.equal(taxUpdateSchema.safeParse({ ...payment, kind: "payment_update", id: 1, version: 1 }).success, false);
  assert.equal(taxUpdateSchema.safeParse({ kind: "reconciliation_snapshot_update", id: 1, version: 1 }).success, false);
});

test("replays payments and reversals only as of the requested period end", () => {
  const payments = [
    { id: 1, paymentKind: "payment", paidOn: "2026-06-20", reversesPaymentId: null, allocations: [{ filingId: 10, allocatedAmount: 100 }] },
    { id: 2, paymentKind: "payment", paidOn: "2026-07-02", reversesPaymentId: null, allocations: [{ filingId: 10, allocatedAmount: 50 }] },
    { id: 3, paymentKind: "reversal", paidOn: "2026-07-05", reversesPaymentId: 1, allocations: [] },
  ];
  const june = calculateTaxPaidByFilingAsOf(payments, "2026-06-30");
  assert.equal(june.paidByFiling.get(10), 100);
  assert.equal(june.effectivePaymentIds.has(1), true);

  const july = calculateTaxPaidByFilingAsOf(payments, "2026-07-31");
  assert.equal(july.paidByFiling.get(10), 50);
  assert.equal(july.effectivePaymentIds.has(1), false);
  assert.equal(july.effectivePaymentIds.has(2), true);
});
