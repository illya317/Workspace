#!/usr/bin/env node

import "dotenv/config";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";

const INPUT_KIND = "finance-supplemental-voucher";
const SOURCE_SYSTEM = "WORKSPACE";
const SOURCE_DATABASE = "WORKSPACE";
const VOUCHER_TYPE_CODE = "SUPPLEMENTAL";
const VOUCHER_TYPE_NAME = "补录凭证";

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, keys) {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function nonEmptyText(value, maxLength = 240) {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maxLength;
}

function amountCents(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,14})\.[0-9]{2}$/.test(value)) return null;
  const cents = BigInt(value.replace(".", ""));
  return cents > 0n ? cents : null;
}

function centsText(cents) {
  const digits = cents.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function digestInput(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function validateFinanceSupplementalVoucherInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !exactKeys(value, ["schemaVersion", "kind", "releaseKey", "actorUserId", "company", "voucher"])
    || value.schemaVersion !== 1 || value.kind !== INPUT_KIND
    || !nonEmptyText(value.releaseKey, 120) || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value.releaseKey)
    || !Number.isInteger(value.actorUserId) || value.actorUserId <= 0) {
    fail("finance supplemental voucher input is invalid");
  }
  const company = value.company;
  if (!company || typeof company !== "object" || Array.isArray(company)
    || !exactKeys(company, ["code", "name", "identityNumber"])
    || !nonEmptyText(company.code, 40) || !nonEmptyText(company.name, 120)
    || !nonEmptyText(company.identityNumber, 80)) {
    fail("finance supplemental voucher company is invalid");
  }
  const voucher = value.voucher;
  if (!voucher || typeof voucher !== "object" || Array.isArray(voucher)
    || !exactKeys(voucher, ["voucherNo", "date", "description", "counterpartyName", "currencyCode", "lines"])
    || !nonEmptyText(voucher.voucherNo, 120) || !/^\d{4}-\d{2}-\d{2}$/.test(voucher.date)
    || !nonEmptyText(voucher.description, 500) || !nonEmptyText(voucher.counterpartyName, 240)
    || typeof voucher.currencyCode !== "string" || !/^[A-Z]{3}$/.test(voucher.currencyCode)
    || !Array.isArray(voucher.lines) || voucher.lines.length < 2 || voucher.lines.length > 100) {
    fail("finance supplemental voucher payload is invalid");
  }
  const date = new Date(`${voucher.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== voucher.date) {
    fail("finance supplemental voucher date is invalid");
  }
  let debitCents = 0n;
  let creditCents = 0n;
  const accountCodes = new Set();
  for (const line of voucher.lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)
      || !exactKeys(line, ["accountCode", "accountName", "side", "amount", "description", "relatedEntity"])
      || !nonEmptyText(line.accountCode, 80) || !nonEmptyText(line.accountName, 160)
      || (line.side !== "debit" && line.side !== "credit")
      || !nonEmptyText(line.description, 500) || line.relatedEntity !== voucher.counterpartyName
      || accountCodes.has(line.accountCode)) {
      fail("finance supplemental voucher line is invalid or duplicated");
    }
    const cents = amountCents(line.amount);
    if (cents === null) fail("finance supplemental voucher line amount must be a positive two-decimal string");
    if (line.side === "debit") debitCents += cents;
    else creditCents += cents;
    accountCodes.add(line.accountCode);
  }
  if (debitCents === 0n || debitCents !== creditCents) fail("finance supplemental voucher must be balanced");
  return value;
}

async function verifyCompany(client, input) {
  const result = await client.query(`
    SELECT company.id, company.code, party.name, party."identityNumber"
    FROM "Company" company
    JOIN "Party" party ON party.id = company."partyId"
    WHERE company.code = $1
      AND party.name = $2
      AND party."identityNumber" = $3
      AND company."isActive" = true
    FOR SHARE OF company, party
  `, [input.company.code, input.company.name, input.company.identityNumber]);
  if (result.rowCount !== 1) fail("finance supplemental voucher company does not match the active legal entity");
}

async function resolvePeriod(client, input) {
  const year = Number(input.voucher.date.slice(0, 4));
  const month = Number(input.voucher.date.slice(5, 7));
  const result = await client.query(`
    SELECT id, "startDate", "endDate", "isClosed"
    FROM "FinancePeriod"
    WHERE "companyCode" = $1 AND year = $2 AND month = $3
    FOR SHARE
  `, [input.company.code, year, month]);
  const period = result.rows[0];
  if (result.rowCount !== 1 || input.voucher.date < period.startDate || input.voucher.date > period.endDate) {
    fail("finance supplemental voucher accounting period is missing or does not contain the voucher date");
  }
  return { ...period, year, month };
}

async function resolveAccounts(client, input, year) {
  const requested = input.voucher.lines.map((line) => line.accountCode);
  const result = await client.query(`
    SELECT id, code, name, "balanceDirection"
    FROM "FinanceAccount"
    WHERE "companyCode" = $1 AND year = $2 AND code = ANY($3::text[]) AND "isActive" = true
    FOR SHARE
  `, [input.company.code, year, requested]);
  const byCode = new Map(result.rows.map((row) => [row.code, row]));
  for (const line of input.voucher.lines) {
    const account = byCode.get(line.accountCode);
    if (!account || account.name !== line.accountName) {
      fail(`finance supplemental voucher account ${line.accountCode} does not match the active year account`);
    }
  }
  return byCode;
}

async function ensureNoConflictingVoucher(client, input, periodId) {
  const result = await client.query(`
    SELECT id, "voucherNo", "sourceKey"
    FROM "FinanceVoucher"
    WHERE ("companyCode" = $1 AND "periodId" = $2 AND "voucherNo" = $3)
       OR ("sourceSystem" = $4 AND "sourceDatabase" = $5 AND "sourceKey" = $6)
    FOR UPDATE
  `, [
    input.company.code,
    periodId,
    input.voucher.voucherNo,
    SOURCE_SYSTEM,
    SOURCE_DATABASE,
    input.releaseKey,
  ]);
  if (result.rowCount > 0) fail("finance supplemental voucher already exists without its data release marker");
}

async function insertVoucher(client, input, period, accounts) {
  const debitCents = input.voucher.lines
    .filter((line) => line.side === "debit")
    .reduce((sum, line) => sum + amountCents(line.amount), 0n);
  const total = centsText(debitCents);
  const metadata = JSON.stringify({
    kind: INPUT_KIND,
    releaseKey: input.releaseKey,
    counterpartyName: input.voucher.counterpartyName,
  });
  const voucherResult = await client.query(`
    INSERT INTO "FinanceVoucher"
      ("voucherNo", date, "periodId", description, "totalDebit", "totalCredit", status, "companyCode",
       "sourceSystem", "sourceDatabase", "sourceKey", "voucherTypeCode", "voucherTypeName", "sourcePosted",
       "sourceMetadata", "editedBy", "editedAt")
    VALUES ($1, $2, $3, $4, $5::numeric, $5::numeric, 'posted', $6,
            $7, $8, $9, $10, $11, true, $12::jsonb, $13, now())
    RETURNING id
  `, [
    input.voucher.voucherNo,
    input.voucher.date,
    period.id,
    input.voucher.description,
    total,
    input.company.code,
    SOURCE_SYSTEM,
    SOURCE_DATABASE,
    input.releaseKey,
    VOUCHER_TYPE_CODE,
    VOUCHER_TYPE_NAME,
    metadata,
    input.actorUserId,
  ]);
  const voucherId = voucherResult.rows[0].id;
  for (const [index, line] of input.voucher.lines.entries()) {
    const amount = line.amount;
    const debit = line.side === "debit" ? amount : "0.00";
    const credit = line.side === "credit" ? amount : "0.00";
    await client.query(`
      INSERT INTO "FinanceVoucherItem"
        ("voucherId", "accountId", debit, credit, description, "relatedEntity", "sortOrder",
         "sourceSystem", "sourceDatabase", "sourceKey", "currencyCode", "exchangeRate",
         "originalDebit", "originalCredit", "sourceMetadata")
      VALUES ($1, $2, $3::numeric, $4::numeric, $5, $6, $7,
              $8, $9, $10, $11, 1, $3::numeric, $4::numeric, $12::jsonb)
    `, [
      voucherId,
      accounts.get(line.accountCode).id,
      debit,
      credit,
      line.description,
      line.relatedEntity,
      index,
      SOURCE_SYSTEM,
      SOURCE_DATABASE,
      `${input.releaseKey}:line:${index + 1}`,
      input.voucher.currencyCode,
      metadata,
    ]);
  }
  return { voucherId, total, itemCount: input.voucher.lines.length };
}

export async function repairFinanceSupplementalVoucher(client, rawInput) {
  const input = validateFinanceSupplementalVoucherInput(rawInput);
  const markerKey = `data.release.finance.supplemental-voucher.${input.releaseKey}`;
  const inputDigest = digestInput(input);
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [markerKey]);
    const prior = await client.query('SELECT "value" FROM "SystemConfig" WHERE "key" = $1', [markerKey]);
    if (prior.rowCount === 1) {
      const recorded = JSON.parse(prior.rows[0].value);
      if (recorded.inputDigest !== inputDigest) fail(`finance supplemental voucher marker ${input.releaseKey} belongs to different input`);
      await client.query("COMMIT");
      return { ...recorded.result, alreadyApplied: true };
    }
    const actor = await client.query(`
      SELECT id FROM "User" WHERE id = $1 AND username = 'admin' AND "canLogin" = true FOR SHARE
    `, [input.actorUserId]);
    if (actor.rowCount !== 1) fail("finance supplemental voucher requires the active root admin actor");
    await verifyCompany(client, input);
    const period = await resolvePeriod(client, input);
    const accounts = await resolveAccounts(client, input, period.year);
    await ensureNoConflictingVoucher(client, input, period.id);
    const result = await insertVoucher(client, input, period, accounts);
    await client.query('INSERT INTO "SystemConfig" ("key", "value") VALUES ($1, $2)', [
      markerKey,
      JSON.stringify({ inputDigest, result, appliedAt: new Date().toISOString() }),
    ]);
    await client.query("COMMIT");
    return { ...result, alreadyApplied: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main() {
  if (!process.argv.includes("--execute")) fail("repair requires --execute through the governed data-release handler");
  const inputFile = process.argv.find((argument) => argument.startsWith("--input-file="))?.slice(13);
  if (!inputFile || !path.isAbsolute(inputFile) || !fs.statSync(inputFile).isFile()) {
    fail("repair requires --input-file=<absolute-file>");
  }
  const input = validateFinanceSupplementalVoucherInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({
    connectionString: requireDatabaseUrl(),
    application_name: "workspace-finance-supplemental-voucher",
  });
  await client.connect();
  try {
    const result = await repairFinanceSupplementalVoucher(client, input);
    process.stdout.write(`${JSON.stringify({ completed: true, releaseKey: input.releaseKey, ...result })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
