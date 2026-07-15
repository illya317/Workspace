import assert from "node:assert/strict";
import test from "node:test";

import { financeLedgerScopeFromCutoffDate } from "./periods";

test("builds the default Finance ledger scope from an import cutoff date", () => {
  assert.deepEqual(financeLedgerScopeFromCutoffDate("02", "2026-06-30"), {
    companyCode: "02",
    year: 2026,
    month: 6,
  });
});

test("rejects absent or malformed cutoff dates", () => {
  assert.equal(financeLedgerScopeFromCutoffDate("02", null), null);
  assert.equal(financeLedgerScopeFromCutoffDate("02", "2026-13-31"), null);
  assert.equal(financeLedgerScopeFromCutoffDate("02", "2026/06/30"), null);
});
