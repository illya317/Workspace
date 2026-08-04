#!/usr/bin/env node
import "dotenv/config";

import fs from "node:fs";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";

const INPUT_KIND = "finance-capital-transaction-evidence";

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

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function validMoney(value) {
  return Number.isFinite(value) && value > 0 && money(value) === value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function jsonObject(value, label) {
  if (value === null || value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be a JSON object`);
  return value;
}

function validateFact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("capital transaction evidence fact is invalid");
  exactKeys(value, [
    "accountCode",
    "bookedAmountCny",
    "companyCode",
    "contributionDate",
    "evidence",
    "label",
    "originalAmount",
    "originalCurrency",
    "targetCompanyCode",
    "targetLineCode",
    "voucherDate",
    "voucherNo",
  ], "capital transaction evidence fact");
  for (const field of ["accountCode", "companyCode", "evidence", "label", "targetCompanyCode", "voucherNo"]) {
    if (!nonEmptyString(value[field])) fail(`capital transaction evidence ${field} is invalid`);
  }
  if (!validDate(value.voucherDate) || !validDate(value.contributionDate)) {
    fail("capital transaction evidence dates are invalid");
  }
  if (value.originalCurrency !== "CAD") fail("capital transaction evidence originalCurrency must be CAD");
  if (value.targetLineCode !== "paidInCapital" && value.targetLineCode !== "capitalReserve") {
    fail("capital transaction evidence targetLineCode is invalid");
  }
  if (!validMoney(value.bookedAmountCny) || !validMoney(value.originalAmount)) {
    fail("capital transaction evidence amounts are invalid");
  }
  return value;
}

export function validateFinanceCapitalTransactionEvidenceInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("capital transaction evidence input is invalid");
  exactKeys(value, ["facts", "kind", "schemaVersion"], "capital transaction evidence input");
  if (value.kind !== INPUT_KIND || value.schemaVersion !== 1
    || !Array.isArray(value.facts) || value.facts.length < 1 || value.facts.length > 500) {
    fail("capital transaction evidence input is invalid");
  }
  const facts = value.facts.map(validateFact);
  const keys = facts.map((fact) => [
    fact.companyCode,
    fact.voucherDate,
    fact.voucherNo,
    fact.accountCode,
    fact.bookedAmountCny.toFixed(2),
  ].join(":"));
  if (new Set(keys).size !== keys.length) fail("capital transaction evidence facts contain duplicate targets");
  return { ...value, facts };
}

export function mergeCapitalTransactionEvidence(sourceMetadata, fact) {
  const metadata = jsonObject(sourceMetadata, "voucher item sourceMetadata");
  const evidence = jsonObject(metadata.evidence, "voucher item sourceMetadata.evidence");
  const matching = {
    label: fact.label,
    companyCode: fact.targetCompanyCode,
    lineCode: fact.targetLineCode,
    currencyCode: fact.originalCurrency,
    originalAmount: fact.originalAmount,
  };
  if (evidence.actualContributionDate !== undefined
    && evidence.actualContributionDate !== fact.contributionDate) {
    fail("voucher item already contains a different actual contribution date");
  }
  if (evidence.matching !== undefined && canonicalJson(evidence.matching) !== canonicalJson(matching)) {
    fail("voucher item already contains different capital matching evidence");
  }
  if (evidence.capitalTransactionEvidence !== undefined
    && evidence.capitalTransactionEvidence !== fact.evidence) {
    fail("voucher item already contains different capital transaction provenance");
  }
  return {
    ...metadata,
    evidence: {
      ...evidence,
      actualContributionDate: fact.contributionDate,
      matching,
      capitalTransactionEvidence: fact.evidence,
    },
  };
}

function parseArgs(argv) {
  if (!argv.includes("--execute")) fail("capital transaction evidence repair requires --execute through governed data release");
  const inputArg = argv.find((value) => value.startsWith("--input-file="));
  if (!inputArg) fail("capital transaction evidence repair requires --input-file");
  return inputArg.slice("--input-file=".length);
}

function sameMoney(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.005;
}

async function loadTarget(client, fact) {
  const targetCompany = await client.query('SELECT id FROM "Company" WHERE code = $1', [fact.targetCompanyCode]);
  if (targetCompany.rows.length !== 1) fail(`capital transaction target company ${fact.targetCompanyCode} is not unique`);
  const result = await client.query(`
    SELECT item.id, item.debit, item.credit, item."sourceMetadata", voucher.id AS "voucherId",
      voucher.status, voucher."sourcePosted", voucher."companyId",
      company.id AS "resolvedCompanyId"
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
  const candidates = result.rows.filter((row) => sameMoney(
    Math.max(Math.abs(Number(row.debit)), Math.abs(Number(row.credit))),
    fact.bookedAmountCny,
  ));
  if (candidates.length !== 1) {
    fail(`capital transaction target ${fact.companyCode}/${fact.voucherNo}/${fact.accountCode}/${fact.bookedAmountCny} is not unique`);
  }
  const row = candidates[0];
  if (row.sourcePosted !== true && row.status !== "posted") fail(`capital transaction target ${row.id} is not posted`);
  if (row.companyId !== null && row.companyId !== row.resolvedCompanyId) {
    fail(`capital transaction target ${row.id} has an invalid company reference`);
  }
  return row;
}

async function applyFact(client, fact) {
  const target = await loadTarget(client, fact);
  let companyReferenceUpdated = false;
  if (target.companyId === null) {
    const companyUpdate = await client.query(`
      UPDATE "FinanceVoucher" SET "companyId" = $2, "updatedAt" = NOW()
      WHERE id = $1 AND "companyId" IS NULL
      RETURNING id
    `, [target.voucherId, target.resolvedCompanyId]);
    if (companyUpdate.rows.length !== 1) fail(`capital transaction voucher ${target.voucherId} changed concurrently`);
    companyReferenceUpdated = true;
  }
  const nextMetadata = mergeCapitalTransactionEvidence(target.sourceMetadata, fact);
  if (canonicalJson(nextMetadata) === canonicalJson(target.sourceMetadata)) {
    return { id: target.id, status: companyReferenceUpdated ? "reference-updated" : "unchanged" };
  }
  const updated = await client.query(`
    UPDATE "FinanceVoucherItem" SET "sourceMetadata" = $2::jsonb
    WHERE id = $1 AND "sourceMetadata" IS NOT DISTINCT FROM $3::jsonb
    RETURNING id
  `, [target.id, JSON.stringify(nextMetadata), JSON.stringify(target.sourceMetadata)]);
  if (updated.rows.length !== 1) fail(`capital transaction target ${target.id} changed concurrently`);
  return { id: target.id, status: companyReferenceUpdated ? "updated-with-reference" : "updated" };
}

export async function main(argv = process.argv.slice(2)) {
  const inputFile = parseArgs(argv);
  const input = validateFinanceCapitalTransactionEvidenceInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({ connectionString: requireDatabaseUrl(), application_name: "workspace-finance-capital-transaction-evidence" });
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
