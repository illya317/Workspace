import assert from "node:assert/strict";
import test from "node:test";

import { findTableRowInteractionViolationsInSource } from "./table-row-interaction";

test("accepts row-click opening for an expanded form", () => {
  const violations = findTableRowInteractionViolationsInSource("safe.tsx", `
    const table = {
      onRowClick: (row) => open(row),
      expandedRow: (row) => ({ kind: "form", form: buildForm(row) }),
      rowActions: (row) => [{ kind: "delete", onClick: () => remove(row) }],
    };
  `);

  assert.deepEqual(violations, []);
});

test("rejects an edit icon used as the only expanded-form opener", () => {
  const violations = findTableRowInteractionViolationsInSource("unsafe.tsx", `
    const table = {
      expandedRow: (row) => ({ kind: "form", form: buildForm(row) }),
      rowActions: (row) => [{ kind: "edit", onClick: () => open(row) }],
    };
  `);

  assert.deepEqual(violations.map((violation) => violation.kind), [
    "expanded-form-without-row-open",
    "expanded-form-edit-trigger",
  ]);
});
