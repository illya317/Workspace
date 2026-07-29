import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  "prisma/migrations/20260730012000_finance_close_append_only_evidence/migration.sql",
);

test("close evidence and event ledgers reject database updates and deletes", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const table of ["FinanceCloseEvidenceSnapshot", "FinanceCloseEvent", "FinanceCloseWorkpaperEvent"]) {
    assert.match(sql, new RegExp(`CREATE TRIGGER "${table}_append_only"[\\s\\S]+BEFORE UPDATE OR DELETE ON "${table}"`, "u"));
  }
});
