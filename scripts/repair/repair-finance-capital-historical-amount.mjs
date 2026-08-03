#!/usr/bin/env node
import "dotenv/config";

import fs from "node:fs";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";

const INPUT_KIND = "finance-capital-historical-amount";

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

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function validMoney(value) {
  return Number.isFinite(value) && value > 0 && Math.round(value * 100) / 100 === value;
}

function validateFact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("capital historical fact is invalid");
  const targetFields = value.sourceKind === "openingBalance"
    ? ["periodStart"]
    : value.sourceKind === "voucherItem"
      ? ["voucherDate", "voucherNo"]
      : fail("capital historical fact sourceKind is invalid");
  exactKeys(value, [
    "accountCode",
    "companyCode",
    "evidence",
    "historicalAmountCny",
    "originalAmount",
    "originalCurrency",
    "sourceKind",
    ...targetFields,
  ], "capital historical fact");
  for (const field of ["accountCode", "companyCode", "evidence"]) {
    if (!nonEmptyString(value[field])) fail(`capital historical fact ${field} is invalid`);
  }
  if (value.originalCurrency !== "CAD") fail("capital historical fact originalCurrency must be CAD");
  if (value.sourceKind === "openingBalance" && !validDate(value.periodStart)) {
    fail("capital historical fact periodStart is invalid");
  }
  if (value.sourceKind === "voucherItem"
    && (!validDate(value.voucherDate) || !nonEmptyString(value.voucherNo))) {
    fail("capital historical voucher target is invalid");
  }
  if (!validMoney(value.originalAmount) || !validMoney(value.historicalAmountCny)) {
    fail("capital historical fact amounts are invalid");
  }
  return value;
}

export function validateFinanceCapitalHistoricalAmountInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("capital historical input is invalid");
  exactKeys(value, ["facts", "kind", "schemaVersion"], "capital historical input");
  if (value.kind !== INPUT_KIND || value.schemaVersion !== 1
    || !Array.isArray(value.facts) || value.facts.length < 1 || value.facts.length > 500) {
    fail("capital historical input is invalid");
  }
  const facts = value.facts.map(validateFact);
  const keys = facts.map((fact) => fact.sourceKind === "openingBalance"
    ? `${fact.sourceKind}:${fact.companyCode}:${fact.accountCode}:${fact.periodStart}`
    : `${fact.sourceKind}:${fact.companyCode}:${fact.accountCode}:${fact.voucherDate}:${fact.voucherNo}`);
  if (new Set(keys).size !== keys.length) fail("capital historical facts contain duplicate targets");
  return { ...value, facts };
}

function parseArgs(argv) {
  if (!argv.includes("--execute")) fail("capital historical repair requires --execute through governed data release");
  const inputArg = argv.find((value) => value.startsWith("--input-file="));
  if (!inputArg) fail("capital historical repair requires --input-file");
  return inputArg.slice("--input-file=".length);
}

function sameMoney(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.005;
}

async function loadOpeningTarget(client, fact) {
  const result = await client.query(`
    SELECT balance.id, balance."companyId", company.id AS "resolvedCompanyId",
      balance."openingDebit", balance."openingCredit",
      balance."capitalHistoricalAmountCny", balance."capitalEvidenceKind", balance."capitalEvidence"
    FROM "FinanceAccountBalance" AS balance
    JOIN "FinancePeriod" AS period ON period.id = balance."periodId"
    JOIN "FinanceAccount" AS account ON account.id = balance."accountId"
    JOIN "Company" AS company ON company.code = balance."companyCode"
    WHERE company.code = $1 AND balance."companyCode" = $1 AND account."companyCode" = $1
      AND account.code = $2 AND account.year = period.year AND period."startDate" = $3
    FOR UPDATE OF balance
  `, [fact.companyCode, fact.accountCode, fact.periodStart]);
  if (result.rows.length !== 1) fail(`capital opening target ${fact.companyCode}/${fact.accountCode}/${fact.periodStart} is not unique`);
  return { table: "FinanceAccountBalance", row: result.rows[0], originalAmount: Number(result.rows[0].openingCredit) - Number(result.rows[0].openingDebit) };
}

async function loadVoucherTarget(client, fact) {
  const result = await client.query(`
    SELECT item.id, voucher.status, voucher."sourcePosted", voucher."companyId",
      company.id AS "resolvedCompanyId", item.debit, item.credit,
      item."capitalHistoricalAmountCny", item."capitalEvidenceKind", item."capitalEvidence"
    FROM "FinanceVoucherItem" AS item
    JOIN "FinanceVoucher" AS voucher ON voucher.id = item."voucherId"
    JOIN "FinancePeriod" AS period ON period.id = voucher."periodId"
    JOIN "FinanceAccount" AS account ON account.id = item."accountId"
    JOIN "Company" AS company ON company.code = voucher."companyCode"
    WHERE company.code = $1 AND voucher."companyCode" = $1 AND account."companyCode" = $1
      AND account.code = $2 AND account.year = period.year
      AND voucher.date = $3 AND voucher."voucherNo" = $4
    FOR UPDATE OF item
  `, [fact.companyCode, fact.accountCode, fact.voucherDate, fact.voucherNo]);
  if (result.rows.length !== 1) fail(`capital voucher target ${fact.companyCode}/${fact.voucherNo}/${fact.accountCode} is not unique`);
  const row = result.rows[0];
  if (row.sourcePosted !== true && row.status !== "posted") fail(`capital voucher target ${row.id} is not posted`);
  return { table: "FinanceVoucherItem", row, originalAmount: Number(row.credit) - Number(row.debit) };
}

async function applyFact(client, fact) {
  const target = fact.sourceKind === "openingBalance"
    ? await loadOpeningTarget(client, fact)
    : await loadVoucherTarget(client, fact);
  if (!sameMoney(target.originalAmount, fact.originalAmount)) fail(`capital historical target ${target.row.id} original amount changed`);
  const evidenceKind = fact.sourceKind === "openingBalance" ? "openingBalance" : "voucher";
  if (target.row.capitalHistoricalAmountCny !== null) {
    if (!sameMoney(target.row.capitalHistoricalAmountCny, fact.historicalAmountCny)
      || target.row.capitalEvidenceKind !== evidenceKind || target.row.capitalEvidence !== fact.evidence) {
      fail(`capital historical target ${target.row.id} already contains different evidence`);
    }
    return { id: target.row.id, sourceKind: fact.sourceKind, status: "unchanged" };
  }
  const updated = target.table === "FinanceAccountBalance"
    ? await client.query(`
        UPDATE "FinanceAccountBalance" SET "capitalHistoricalAmountCny" = $2,
          "capitalEvidenceKind" = $3, "capitalEvidence" = $4,
          "companyId" = $5, "updatedAt" = NOW()
        WHERE id = $1 AND "capitalHistoricalAmountCny" IS NULL RETURNING id
      `, [target.row.id, fact.historicalAmountCny, evidenceKind, fact.evidence, target.row.resolvedCompanyId])
    : await client.query(`
        UPDATE "FinanceVoucherItem" SET "capitalHistoricalAmountCny" = $2,
          "capitalEvidenceKind" = $3, "capitalEvidence" = $4
        WHERE id = $1 AND "capitalHistoricalAmountCny" IS NULL RETURNING id
      `, [target.row.id, fact.historicalAmountCny, evidenceKind, fact.evidence]);
  if (updated.rows.length !== 1) fail(`capital historical target ${target.row.id} changed concurrently`);
  return { id: target.row.id, sourceKind: fact.sourceKind, status: "updated" };
}

export async function main(argv = process.argv.slice(2)) {
  const inputFile = parseArgs(argv);
  const input = validateFinanceCapitalHistoricalAmountInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({ connectionString: requireDatabaseUrl(), application_name: "workspace-finance-capital-historical-amount" });
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
