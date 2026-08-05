import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseMigrationMode } from "./check-migration-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = path.join(repoRoot, "prisma/models/finance-statement-comparison.prisma");
const expandPath = path.join(
  repoRoot,
  "prisma/migrations/20260805153000_finance_statement_comparison/migration.sql",
);
const immutabilityPath = path.join(
  repoRoot,
  "prisma/migrations/20260805153100_finance_statement_comparison_immutability/migration.sql",
);

const modelSource = fs.readFileSync(modelPath, "utf8");
const expandSql = fs.readFileSync(expandPath, "utf8");
const immutabilitySql = fs.readFileSync(immutabilityPath, "utf8");

test("comparison model file declares the four immutable evidence models", () => {
  for (const model of [
    "FinanceStatementComparisonPackage",
    "FinanceStatementComparisonMapping",
    "FinanceStatementComparisonRun",
    "FinanceStatementComparisonLine",
  ]) {
    assert.match(modelSource, new RegExp(`model ${model} \\{`), `${model} model missing`);
  }
});

test("comparison line prevents duplicate line/cell insertion within one run", () => {
  assert.match(modelSource, /@@unique\(\[runId, lineCode\]\)/);
  assert.match(modelSource, /@@unique\(\[runId, sourceSheet, sourceCell\]\)/);
});

test("comparison mapping carries optimistic revision CAS input", () => {
  assert.match(modelSource, /revision\s+Int\s+@default\(1\)/);
  assert.match(modelSource, /workbookSha256\s+String/);
  assert.match(modelSource, /targetFingerprint\s+String/);
});

test("expand migration is additive-only and carries the mode marker", () => {
  assert.equal(parseMigrationMode(expandSql), "expand");
  for (const table of [
    "FinanceStatementComparisonPackage",
    "FinanceStatementComparisonMapping",
    "FinanceStatementComparisonRun",
    "FinanceStatementComparisonLine",
  ]) {
    assert.match(expandSql, new RegExp(`CREATE TABLE "${table}"`), `${table} DDL missing`);
  }
  assert.doesNotMatch(expandSql, /\bDROP\b|\bTRUNCATE\b/i);
});

test("expand migration freezes enum/check invariants", () => {
  for (const constraint of [
    "FinanceStatementComparisonPackage_lifecycle_check",
    "FinanceStatementComparisonMapping_target_shape_check",
    "FinanceStatementComparisonRun_completion_check",
    "FinanceStatementComparisonLine_explanationStatus_check",
  ]) {
    assert.match(expandSql, new RegExp(`"${constraint}"`), `${constraint} missing`);
  }
});

test("immutability migration is maintenance-mode and guards all four tables", () => {
  assert.equal(parseMigrationMode(immutabilitySql), "maintenance");
  for (const trigger of [
    "FinanceStatementComparisonPackage_guard",
    "FinanceStatementComparisonPackage_no_truncate",
    "FinanceStatementComparisonMapping_cas_guard",
    "FinanceStatementComparisonRun_guard",
    "FinanceStatementComparisonRun_no_truncate",
    "FinanceStatementComparisonLine_append_only",
    "FinanceStatementComparisonLine_no_truncate",
  ]) {
    assert.match(immutabilitySql, new RegExp(`CREATE TRIGGER "${trigger}"`), `${trigger} missing`);
  }
});

test("immutability migration enforces completed-run freeze and revision CAS", () => {
  assert.match(immutabilitySql, /OLD\."status" IN \('completed', 'failed'\)/);
  assert.match(immutabilitySql, /NEW\."revision" IS DISTINCT FROM OLD\."revision" \+ 1/);
  assert.match(immutabilitySql, /r\."status" = 'completed'/);
});
