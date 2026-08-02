import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("24000 permits every importer reconciliation status including ledger control adjustment", async () => {
  const sql = await readFile("prisma/migrations/20260730024000_finance_asset_legacy_cutover/migration.sql", "utf8");
  assert.match(sql, /"reconciliationStatus" IN \('matched', 'rounding_allocated', 'ledger_control_adjusted', 'pending_allocation'\)/);
});
