import assert from "node:assert/strict";
import test from "node:test";

import type { FormSurfaceFieldSpec, FormSurfaceRepeatableSpec } from "@workspace/core/ui";
import { emptyLoanDraft, type InterestWorkpaperDraft } from "./treasury-model";
import { interestSections, loanSections } from "./treasury-forms";

test("loan form uses the standard remote Party reference and preserves an existing value", () => {
  const draft = emptyLoanDraft({ companyCode: "C1", year: 2026, month: 7 }, "token");
  draft.lenderPartyId = 17;
  const field = findField(loanSections(draft, () => undefined), "lenderPartyId");

  assert.equal(field.label, "贷款方主体");
  assert.equal(field.value, "17");
  assert.deepEqual(field.spec, {
    valueType: "reference",
    control: "reference",
    options: {
      source: "remote",
      fkKey: "finance.treasury.lenderParty",
      endpoint: "/api/modules/finance/treasury/reference-options",
      returnField: "id",
      lifecycleScope: "active",
    },
    validation: { required: true },
  });
});

test("loan Party reference is read only when update is unavailable", () => {
  const draft = emptyLoanDraft({ companyCode: "C1", year: 2026, month: 7 }, "token");
  draft.lenderPartyId = 17;
  const field = findField(loanSections(draft, () => undefined, true), "lenderPartyId");
  assert.equal(field.readOnly, true);
  assert.equal(field.value, "17");
});

test("generated technical keys stay out of the default loan form", () => {
  const draft = emptyLoanDraft({ companyCode: "C1", year: 2026, month: 7 }, "token");
  const keys = loanSections(draft, () => undefined).flatMap((section) => section.items.map((item) => item.key));
  assert.equal(keys.includes("identityKey"), false);
});

test("saved interest lines expose the derived calculated interest as a read-only field", () => {
  const draft: InterestWorkpaperDraft = {
    companyCode: "C1",
    year: 2026,
    month: 7,
    periodId: 9,
    loanId: 1,
    status: "draft",
    dayCountConvention: "actual_365",
    note: null,
    sourceKind: "manual",
    lines: [
      { id: 11, lineNo: 1, accrualFrom: "2026-07-01", accrualThrough: "2026-07-31", principalBasis: 100000, annualRate: 0.036, dayCount: 31, sourceReportedInterestAmount: null, note: null, sourceKind: "manual" },
      { lineNo: 2, accrualFrom: "2026-07-01", accrualThrough: "2026-07-15", principalBasis: 50000, annualRate: 0.036, dayCount: 15, sourceReportedInterestAmount: null, note: null, sourceKind: "manual" },
    ],
    voucherLinks: [],
  };
  const sections = interestSections(draft, () => undefined, [], false, {}, { 11: 306 });
  const linesSection = sections.find((section) => section.key === "interest-lines");
  const repeatable = linesSection?.items[0] as FormSurfaceRepeatableSpec | undefined;
  assert.ok(repeatable && repeatable.kind === "repeatable");
  const [savedLine, newLine] = repeatable.items;
  const savedField = savedLine?.items.find((item) => item.key === "line-calculated-0") as FormSurfaceFieldSpec | undefined;
  assert.ok(savedField);
  assert.equal(savedField.label, "计算利息");
  assert.equal(savedField.value, 306);
  assert.equal(savedField.readOnly, true);
  assert.equal(newLine?.items.some((item) => item.key === "line-calculated-1"), false);
});

function findField(
  sections: ReturnType<typeof loanSections>,
  key: string,
): FormSurfaceFieldSpec {
  const item = sections.flatMap((section) => section.items).find((candidate) => candidate.key === key);
  assert.ok(item && "spec" in item, `field not found: ${key}`);
  return item;
}
