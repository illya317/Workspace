#!/usr/bin/env node
import "dotenv/config";

import fs from "node:fs";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";

const INPUT_KIND = "finance-capital-opening-amount";

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort().join(",");
  if (actual !== [...expected].sort().join(",")) fail(`${label} fields are invalid`);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function validMoney(value) {
  return Number.isFinite(value) && value > 0 && Math.round(value * 100) / 100 === value;
}

function validateFact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("capital opening fact is invalid");
  exactKeys(value, [
    "accountCode",
    "companyCode",
    "evidence",
    "historicalAmountCny",
    "originalAmount",
    "originalCurrency",
    "periodStart",
  ], "capital opening fact");
  for (const field of ["accountCode", "companyCode", "evidence"]) {
    if (!nonEmptyString(value[field])) fail(`capital opening fact ${field} is invalid`);
  }
  if (value.originalCurrency !== "CAD") fail("capital opening fact originalCurrency must be CAD");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.periodStart)
    || Number.isNaN(Date.parse(`${value.periodStart}T00:00:00.000Z`))) {
    fail("capital opening fact periodStart is invalid");
  }
  if (!validMoney(value.originalAmount) || !validMoney(value.historicalAmountCny)) {
    fail("capital opening fact amounts are invalid");
  }
  return value;
}

export function validateFinanceCapitalOpeningAmountInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("capital opening input is invalid");
  exactKeys(value, ["facts", "kind", "schemaVersion"], "capital opening input");
  if (value.kind !== INPUT_KIND || value.schemaVersion !== 1
    || !Array.isArray(value.facts) || value.facts.length < 1 || value.facts.length > 100) {
    fail("capital opening input is invalid");
  }
  const facts = value.facts.map(validateFact);
  const keys = facts.map((fact) => `${fact.companyCode}:${fact.accountCode}:${fact.periodStart}`);
  if (new Set(keys).size !== keys.length) fail("capital opening facts contain duplicate targets");
  return { ...value, facts };
}

function parseArgs(argv) {
  if (!argv.includes("--execute")) fail("capital opening repair requires --execute through governed data release");
  const inputArg = argv.find((value) => value.startsWith("--input-file="));
  if (!inputArg) fail("capital opening repair requires --input-file");
  return inputArg.slice("--input-file=".length);
}

function sameMoney(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.005;
}

async function loadTarget(client, fact) {
  const result = await client.query(`
    SELECT
      balance.id,
      balance."companyId",
      company.id AS "resolvedCompanyId",
      balance."openingDebit",
      balance."openingCredit",
      balance."capitalHistoricalAmountCny",
      balance."capitalEvidenceKind",
      balance."capitalEvidence"
    FROM "FinanceAccountBalance" AS balance
    JOIN "FinancePeriod" AS period ON period.id = balance."periodId"
    JOIN "FinanceAccount" AS account ON account.id = balance."accountId"
    JOIN "Company" AS company ON company.code = balance."companyCode"
    WHERE company.code = $1
      AND balance."companyCode" = $1
      AND account."companyCode" = $1
      AND account.code = $2
      AND account.year = period.year
      AND period."startDate" = $3
    FOR UPDATE OF balance
  `, [fact.companyCode, fact.accountCode, fact.periodStart]);
  if (result.rows.length !== 1) {
    fail(`capital opening target ${fact.companyCode}/${fact.accountCode}/${fact.periodStart} is not unique`);
  }
  return result.rows[0];
}

async function applyFact(client, fact) {
  const target = await loadTarget(client, fact);
  const originalAmount = Number(target.openingCredit) - Number(target.openingDebit);
  if (!sameMoney(originalAmount, fact.originalAmount)) {
    fail(`capital opening target ${target.id} original amount changed`);
  }
  if (target.capitalHistoricalAmountCny !== null) {
    if (!sameMoney(target.capitalHistoricalAmountCny, fact.historicalAmountCny)
      || target.capitalEvidenceKind !== "openingBalance"
      || target.capitalEvidence !== fact.evidence) {
      fail(`capital opening target ${target.id} already contains different evidence`);
    }
    return { id: target.id, status: "unchanged" };
  }
  const updated = await client.query(`
    UPDATE "FinanceAccountBalance"
    SET
      "capitalHistoricalAmountCny" = $2,
      "capitalEvidenceKind" = 'openingBalance',
      "capitalEvidence" = $3,
      "companyId" = $4,
      "updatedAt" = NOW()
    WHERE id = $1 AND "capitalHistoricalAmountCny" IS NULL
    RETURNING id
  `, [target.id, fact.historicalAmountCny, fact.evidence, target.resolvedCompanyId]);
  if (updated.rows.length !== 1) fail(`capital opening target ${target.id} changed concurrently`);
  return { id: target.id, status: "updated" };
}

export async function main(argv = process.argv.slice(2)) {
  const inputFile = parseArgs(argv);
  const input = validateFinanceCapitalOpeningAmountInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({
    connectionString: requireDatabaseUrl(),
    application_name: "workspace-finance-capital-opening-amount",
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    const results = [];
    for (const fact of input.facts) results.push(await applyFact(client, fact));
    await client.query("COMMIT");
    process.stdout.write(`${JSON.stringify({ kind: INPUT_KIND, results })}\n`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
