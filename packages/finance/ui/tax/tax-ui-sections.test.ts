import assert from "node:assert/strict";
import test from "node:test";

import type { TaxWorkspace } from "./tax-ui-model";
import { taxFilingPaymentSections, taxReconciliationSections } from "./tax-ui-sections";

const filing = {
  id: 11,
  registrationId: 7,
  filingReference: null,
  filedOn: "2026-06-20",
  status: "filed",
  currencyCode: "CNY",
  version: 4,
  reconciliation: {
    calculatedAmount: 100,
    declaredAmount: 100,
    payableAmount: 100,
    paidAmount: 100,
    calculatedToDeclaredDifference: 0,
    declaredToPayableDifference: 0,
    payableToPaidDifference: 0,
  },
};
const payment = {
  id: 21,
  paymentKind: "payment",
  paidOn: "2026-06-22",
  paymentReference: null,
  amount: 100,
  allocatedAmount: 100,
  unallocatedAmount: 0,
  currencyCode: "CNY",
  idempotencyKey: "tax-payment-internal-key",
  allocations: [{
    id: 31,
    filingId: 11,
    voucherItemId: 99,
    voucherItemLabel: "2026-06-记-0008 · 应交税费",
    allocatedAmount: 100,
  }],
};
const workspace = {
  scope: { companyCode: "C02", year: 2026, month: 6, periodId: 16, isClosed: false },
  taxTypes: [],
  registrations: [{ id: 7, registrationNo: "VAT-C02", taxType: { name: "增值税" } }],
  workpapers: [],
  filings: [filing],
  payments: [payment],
  reconciliationSnapshots: [{
    id: 41,
    registrationId: 7,
    status: "complete",
    capturedAt: "2026-06-30T12:00:00.000Z",
    contributorVersion: "tax-v1",
    inputFingerprint: "internal-fingerprint",
    payloadSha256: "internal-sha",
  }],
  blockers: [{ code: "tax_blocked", message: "申报资料缺失", entityKind: "filing", entityId: 11, deepLink: "/finance/tax?view=filing-payment" }],
  evidenceRefs: [],
} as unknown as TaxWorkspace;

test("Tax business tables replace database ids and technical columns with readable labels", () => {
  const sections = taxFilingPaymentSections({ workspace, canUpdate: false, onEditFiling: () => undefined });
  const filings = table(sections, "tax-filings");
  const payments = table(sections, "tax-payments");
  const allocations = table(sections, "tax-payment-allocations");

  assert.equal(cell(filings, "reference", filing), "增值税 · VAT-C02 · 2026-06-20 · 已申报");
  assert.equal(cell(payments, "reference", payment), "缴款 · 2026-06-22");
  assert.equal(cell(allocations, "payment", { payment, allocation: payment.allocations[0] }), "缴款 · 2026-06-22");
  assert.equal(cell(allocations, "filing", { payment, allocation: payment.allocations[0] }), "增值税 · VAT-C02");
  assert.equal(cell(allocations, "voucher", { payment, allocation: payment.allocations[0] }), "2026-06-记-0008 · 应交税费");
  assert.equal(filings.columns.some((column) => column.key === "version"), false);
  assert.equal(payments.columns.some((column) => column.key === "idempotency"), false);

  const reconciliation = taxReconciliationSections(workspace);
  assert.deepEqual(table(reconciliation, "tax-blockers").columns.map((column) => column.key), ["message", "deepLink"]);
  assert.deepEqual(table(reconciliation, "tax-snapshots").columns.map((column) => column.key), ["registration", "status", "capturedAt"]);
});

function table(sections: ReturnType<typeof taxFilingPaymentSections> | ReturnType<typeof taxReconciliationSections>, key: string) {
  const section = sections.find((item) => item.key === key);
  assert.ok(section && section.body.kind === "data" && section.body.data.kind === "table");
  return section.body.data as unknown as {
    columns: Array<{ key: string; cell: (row: unknown) => unknown }>;
  };
}

function cell(tableValue: ReturnType<typeof table>, key: string, row: unknown) {
  const column = tableValue.columns.find((item) => item.key === key);
  assert.ok(column);
  return column.cell(row);
}
