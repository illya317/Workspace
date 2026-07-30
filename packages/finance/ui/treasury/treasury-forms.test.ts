import assert from "node:assert/strict";
import test from "node:test";

import type { FormSurfaceFieldSpec } from "@workspace/core/ui";
import { emptyLoanDraft } from "./treasury-model";
import { loanSections } from "./treasury-forms";

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

function findField(
  sections: ReturnType<typeof loanSections>,
  key: string,
): FormSurfaceFieldSpec {
  const item = sections.flatMap((section) => section.items).find((candidate) => candidate.key === key);
  assert.ok(item && "spec" in item, `field not found: ${key}`);
  return item;
}
