import assert from "node:assert/strict";
import test from "node:test";

import type { TaxWorkspaceDto } from "../../types/tax";
import {
  buildTaxWriteInput,
  createTaxDraft,
  draftIsValid,
  paymentAllocationTotal,
  type PaymentDraft,
  type WorkpaperDraft,
} from "./tax-ui-model";
import { normalizeTaxWorkspace } from "./tax-ui-normalization";

const scope = { companyCode: "ZX02", year: 2026, month: 6, periodId: 16 };

test("workpaper payload uses the selected method and leaves calculation evidence to the server", () => {
  const draft = createTaxDraft("workpaper", scope) as WorkpaperDraft;
  draft.registrationId = "8";
  draft.status = "prepared";
  draft.accrualLines[0] = {
    ...draft.accrualLines[0],
    lineNo: "1",
    description: "增值税计提",
    method: "base_rate",
    taxBaseAmount: "1000",
    taxRate: "0.06",
    quantity: "99",
    unitRate: "99",
    divisor: "99",
    sourceReportedTaxAmount: "60",
  };

  const payload = buildTaxWriteInput(draft, scope);
  assert.equal(payload.kind, "workpaper_create");
  if (payload.kind !== "workpaper_create") return;
  assert.deepEqual(payload.accrualLines[0], {
    sourceKind: "manual",
    sourceReleaseId: null,
    sourceFile: null,
    sourceKey: null,
    lineNo: 1,
    recognitionOn: null,
    description: "增值税计提",
    voucherItemId: null,
    taxBaseAmount: 1000,
    taxRate: 0.06,
    quantity: null,
    unitRate: null,
    divisor: null,
    sourceReportedTaxAmount: 60,
  });
  assert.equal("calculationVersion" in payload, false);
  assert.equal("inputFingerprint" in payload, false);
});

test("workpaper updates preserve CAS version and existing accrual ids", () => {
  const draft = createTaxDraft("workpaper", scope) as WorkpaperDraft;
  draft.id = 22;
  draft.version = 3;
  draft.registrationId = "8";
  draft.accrualLines[0] = {
    ...draft.accrualLines[0],
    id: 91,
    description: "城建税",
    taxBaseAmount: "100",
    taxRate: "0.07",
  };
  const payload = buildTaxWriteInput(draft, scope);
  assert.equal(payload.kind, "workpaper_update");
  if (payload.kind !== "workpaper_update") return;
  assert.equal(payload.id, 22);
  assert.equal(payload.version, 3);
  assert.equal(payload.accrualLines[0]?.id, 91);
});

test("payment append keeps one stable idempotency key and allocation total", () => {
  const draft = createTaxDraft("payment", scope) as PaymentDraft;
  const key = draft.idempotencyKey;
  draft.amount = "100";
  draft.allocations = [
    { ...draft.allocations[0], filingId: "31", allocatedAmount: "60" },
    { ...draft.allocations[0], key: "allocation-2", filingId: "32", allocatedAmount: "40" },
  ];
  assert.equal(paymentAllocationTotal(draft), 100);
  assert.equal(draftIsValid(draft, null), true);
  const payload = buildTaxWriteInput(draft, { ...scope, periodId: null });
  assert.equal(payload.kind, "payment_append");
  if (payload.kind !== "payment_append") return;
  assert.equal(payload.companyCode, "ZX02");
  assert.equal(payload.idempotencyKey, key);
  assert.equal("companyId" in payload, false);
  assert.deepEqual(payload.allocations.map((row) => row.allocatedAmount), [60, 40]);
});

test("workspace normalization exposes server versions, dates and reconciliation facts", () => {
  const dto: TaxWorkspaceDto = {
    scope: { companyCode: "ZX02", year: 2026, month: 6, periodId: 16, isClosed: false },
    taxTypes: [{ id: 1, code: "VAT", name: "增值税", jurisdiction: "CN", calculationMethod: "base_rate" }],
    registrations: [{
      id: 8, companyId: 2, taxTypeId: 1, registrationNo: "VAT-1", jurisdiction: "CN", filingFrequency: "monthly",
      effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveThrough: null, status: "active", version: 2,
      taxType: { id: 1, code: "VAT", name: "增值税", jurisdiction: "CN", calculationMethod: "base_rate" },
    }],
    workpapers: [],
    filings: [{
      id: 9, registrationId: 8, periodId: 16, filedOn: "2026-06-25T00:00:00.000Z", status: "filed", currencyCode: "CNY", version: 4,
      reconciliation: { calculatedAmount: 60, declaredAmount: 60, payableAmount: 60, paidAmount: 40, payableToPaidDifference: 20 },
    }],
    payments: [],
    reconciliationSnapshots: [],
    blockers: [],
    evidenceRefs: [],
  };
  const workspace = normalizeTaxWorkspace(dto);
  assert.equal(workspace.registrations[0]?.effectiveFrom, "2026-01-01");
  assert.equal(workspace.registrations[0]?.version, 2);
  assert.equal(workspace.filings[0]?.filedOn, "2026-06-25");
  assert.equal(workspace.filings[0]?.reconciliation.payableToPaidDifference, 20);
});
