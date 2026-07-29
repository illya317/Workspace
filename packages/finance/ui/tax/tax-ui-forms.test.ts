import assert from "node:assert/strict";
import test from "node:test";

import type { FormSurfaceFieldSpec } from "@workspace/core/ui";
import { createTaxDraft, type TaxWorkspace } from "./tax-ui-model";
import { taxDraftFormSections } from "./tax-ui-forms";

const scope = { companyCode: "C02", year: 2026, month: 6 };
const workspace = {
  scope: { ...scope, periodId: 16, isClosed: false },
  taxTypes: [], registrations: [], workpapers: [], filings: [], payments: [],
  reconciliationSnapshots: [], blockers: [], evidenceRefs: [],
} as TaxWorkspace;

function sections(draft: ReturnType<typeof createTaxDraft>) {
  return taxDraftFormSections({
    draft,
    workspace,
    onKindChange: () => undefined,
    onChange: () => undefined,
    onLineChange: () => undefined,
    onAddLine: () => undefined,
    onRemoveLine: () => undefined,
    onAllocationChange: () => undefined,
    onAddAllocation: () => undefined,
    onRemoveAllocation: () => undefined,
  });
}

function fields(value: unknown): FormSurfaceFieldSpec[] {
  if (Array.isArray(value)) return value.flatMap(fields);
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const own = typeof row.key === "string" && row.spec && typeof row.spec === "object"
    ? [row as unknown as FormSurfaceFieldSpec]
    : [];
  return [...own, ...Object.values(row).flatMap(fields)];
}

test("Tax registration uses the standard remote Party reference for its authority", () => {
  const draft = createTaxDraft("registration", scope);
  const field = fields(sections(draft)).find((item) => item.key === "authorityPartyId");
  assert.ok(field);
  assert.deepEqual(field.spec.options, {
    source: "remote",
    fkKey: "finance.tax.authorityParty",
    endpoint: "/api/modules/finance/tax/reference-options",
    returnField: "id",
    lifecycleScope: "active",
    queryParams: undefined,
  });
});

test("Tax accrual and payment voucher references are remotely scoped to their business periods", () => {
  const workpaper = createTaxDraft("workpaper", scope);
  const accrual = fields(sections(workpaper)).find((item) => item.label === "计提凭证明细");
  assert.ok(accrual);
  assert.deepEqual(accrual.spec.options, {
    source: "remote",
    fkKey: "finance.tax.accrualVoucherItem",
    endpoint: "/api/modules/finance/tax/reference-options",
    returnField: "id",
    lifecycleScope: undefined,
    queryParams: { companyCode: "C02", periodId: 16 },
  });

  const payment = createTaxDraft("payment", scope);
  assert.equal(payment.kind, "payment");
  if (payment.kind !== "payment") throw new Error("Expected payment draft");
  const allocation = fields(sections(payment)).find((item) => item.label === "缴款凭证明细");
  assert.ok(allocation);
  assert.deepEqual(allocation.spec.options, {
    source: "remote",
    fkKey: "finance.tax.paymentVoucherItem",
    endpoint: "/api/modules/finance/tax/reference-options",
    returnField: "id",
    lifecycleScope: undefined,
    queryParams: { companyCode: "C02", year: 2026, month: 6 },
  });
});

test("Tax forms keep technical persistence fields out of the business interface", () => {
  const payment = createTaxDraft("payment", scope);
  if (payment.kind !== "payment") throw new Error("Expected payment draft");
  payment.idempotencyKey = "internal-idempotency-key";
  payment.sourceReleaseId = "internal-release-id";
  payment.sourceKey = "internal-source-key";
  payment.sourceFile = "税款缴纳回执.xlsx";
  const paymentSurface = JSON.stringify(sections(payment));
  assert.doesNotMatch(paymentSurface, /internal-idempotency-key|internal-release-id|internal-source-key/);
  assert.match(paymentSurface, /税款缴纳回执\.xlsx/);

  const workpaper = createTaxDraft("workpaper", scope);
  assert.equal(workpaper.kind, "workpaper");
  if (workpaper.kind !== "workpaper") throw new Error("Expected workpaper draft");
  workpaper.id = 41;
  workpaper.version = 3;
  workpaper.accrualLines[0]!.id = 51;
  const workpaperSurface = JSON.stringify(sections(workpaper));
  assert.doesNotMatch(workpaperSurface, /#41|#51|幂等键|来源发布|来源键/);
  assert.match(workpaperSurface, /已保存明细/);
});
