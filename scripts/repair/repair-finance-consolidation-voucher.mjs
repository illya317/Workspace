#!/usr/bin/env node
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";

const INPUT_KIND = "finance-consolidation-voucher";
const SOURCE_SYSTEM = "WORKSPACE";
const SOURCE_DATABASE = "governed-data-release";
const VOUCHER_TYPE_CODE = "CONSOLIDATION";
const VOUCHER_TYPE_NAME = "合并凭证";

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

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function validMoney(value) {
  return Number.isFinite(value) && value >= 0 && money(value) === value;
}

function validateAuxiliary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("finance consolidation voucher auxiliary is invalid");
  exactKeys(value, [
    "dimensionType",
    "linkedCompanyCode",
    "sourceCode",
    "sourceLedger",
    "sourceName",
    "sourceRole",
  ], "finance consolidation voucher auxiliary");
  for (const field of Object.keys(value)) {
    if (!nonEmptyString(value[field])) fail(`finance consolidation voucher auxiliary ${field} is invalid`);
  }
  return value;
}

function validateItem(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("finance consolidation voucher item is invalid");
  const required = [
    "accountCode",
    "accountName",
    "balanceDirection",
    "category",
    "credit",
    "debit",
    "description",
    "relatedEntity",
    "sourceDatabase",
    "sourceLedger",
    "sourceSystem",
  ];
  const allowed = new Set([...required, "auxiliary"]);
  if (required.some((field) => !(field in value)) || Object.keys(value).some((field) => !allowed.has(field))) {
    fail("finance consolidation voucher item fields are invalid");
  }
  for (const field of required.filter((field) => !["credit", "debit"].includes(field))) {
    if (!nonEmptyString(value[field])) fail(`finance consolidation voucher item ${field} is invalid`);
  }
  if (!validMoney(value.debit) || !validMoney(value.credit)
    || (value.debit === 0) === (value.credit === 0)) {
    fail("finance consolidation voucher item must contain exactly one positive debit or credit");
  }
  if (value.auxiliary !== undefined) validateAuxiliary(value.auxiliary);
  return value;
}

export function validateFinanceConsolidationVoucherInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("finance consolidation voucher input is invalid");
  exactKeys(value, ["kind", "schemaVersion", "voucher"], "finance consolidation voucher input");
  if (value.schemaVersion !== 1 || value.kind !== INPUT_KIND
    || !value.voucher || typeof value.voucher !== "object" || Array.isArray(value.voucher)) {
    fail("finance consolidation voucher input is invalid");
  }
  exactKeys(value.voucher, [
    "companyCode",
    "date",
    "description",
    "evidence",
    "expectedPeriodSourceKey",
    "items",
    "sourceKey",
    "voucherNo",
  ], "finance consolidation voucher");
  const voucher = value.voucher;
  for (const field of ["companyCode", "description", "expectedPeriodSourceKey", "sourceKey", "voucherNo"]) {
    if (!nonEmptyString(voucher[field])) fail(`finance consolidation voucher ${field} is invalid`);
  }
  if (typeof voucher.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(voucher.date)
    || Number.isNaN(Date.parse(`${voucher.date}T00:00:00.000Z`))) {
    fail("finance consolidation voucher date is invalid");
  }
  if (!voucher.evidence || typeof voucher.evidence !== "object" || Array.isArray(voucher.evidence)) {
    fail("finance consolidation voucher evidence is invalid");
  }
  if (!Array.isArray(voucher.items) || voucher.items.length < 2 || voucher.items.length > 50) {
    fail("finance consolidation voucher items are invalid");
  }
  voucher.items.forEach(validateItem);
  const debit = money(voucher.items.reduce((sum, item) => sum + item.debit, 0));
  const credit = money(voucher.items.reduce((sum, item) => sum + item.credit, 0));
  if (debit <= 0 || debit !== credit) fail("finance consolidation voucher must balance");
  return value;
}

function sameMoney(left, right) {
  return money(left) === money(right);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertExistingVoucherMatches(existing, input, period, accountsByCode) {
  const voucher = input.voucher;
  const total = money(voucher.items.reduce((sum, item) => sum + item.debit, 0));
  const headMatches = existing.voucherNo === voucher.voucherNo
    && existing.date === voucher.date
    && existing.periodId === period.id
    && existing.description === voucher.description
    && sameMoney(existing.totalDebit, total)
    && sameMoney(existing.totalCredit, total)
    && existing.status === "posted"
    && existing.companyCode === voucher.companyCode
    && existing.sourceSystem === SOURCE_SYSTEM
    && existing.sourceDatabase === SOURCE_DATABASE
    && existing.sourceKey === voucher.sourceKey
    && existing.voucherTypeCode === VOUCHER_TYPE_CODE
    && existing.voucherTypeName === VOUCHER_TYPE_NAME
    && existing.isAdjustment === false
    && existing.sourcePosted === true
    && existing.sourceAudited === true
    && existing.sourceInvalid === false
    && canonicalJson(existing.sourceMetadata) === canonicalJson({ kind: INPUT_KIND, evidence: voucher.evidence });
  if (!headMatches || existing.items.length !== voucher.items.length) {
    fail(`consolidation voucher ${voucher.sourceKey} already exists with different facts`);
  }
  for (let index = 0; index < voucher.items.length; index += 1) {
    const expected = voucher.items[index];
    const actual = existing.items[index];
    const account = accountsByCode.get(expected.accountCode);
    const auxiliary = expected.auxiliary;
    const actualAuxiliary = actual.auxiliaries[0] ?? null;
    const itemMatches = actual.accountId === account.id
      && sameMoney(actual.debit, expected.debit)
      && sameMoney(actual.credit, expected.credit)
      && actual.description === expected.description
      && actual.relatedEntity === expected.relatedEntity
      && actual.sortOrder === index
      && actual.sourceSystem === SOURCE_SYSTEM
      && actual.sourceDatabase === SOURCE_DATABASE
      && actual.sourceKey === `${voucher.sourceKey}:${index + 1}`
      && canonicalJson(actual.sourceMetadata) === canonicalJson({ kind: INPUT_KIND, evidence: voucher.evidence })
      && (auxiliary
        ? actual.auxiliaries.length === 1
          && actualAuxiliary.sourceRole === auxiliary.sourceRole
          && actualAuxiliary.companyCode === voucher.companyCode
          && actualAuxiliary.sourceSystem === SOURCE_SYSTEM
          && actualAuxiliary.dimensionType === auxiliary.dimensionType
          && actualAuxiliary.sourceCode === auxiliary.sourceCode
          && actualAuxiliary.sourceName === auxiliary.sourceName
          && actualAuxiliary.sourceLedger === auxiliary.sourceLedger
          && actualAuxiliary.linkedCompanyCode === auxiliary.linkedCompanyCode
        : actual.auxiliaries.length === 0);
    if (!itemMatches) fail(`consolidation voucher ${voucher.sourceKey} line ${index + 1} differs from the private input`);
  }
}

async function loadExistingVoucher(client, sourceKey) {
  const result = await client.query(`
    SELECT
      voucher.id,
      voucher."voucherNo",
      voucher.date,
      voucher."periodId",
      voucher.description,
      voucher."totalDebit",
      voucher."totalCredit",
      voucher.status,
      voucher."companyCode",
      voucher."sourceSystem",
      voucher."sourceDatabase",
      voucher."sourceKey",
      voucher."voucherTypeCode",
      voucher."voucherTypeName",
      voucher."isAdjustment",
      voucher."sourcePosted",
      voucher."sourceAudited",
      voucher."sourceInvalid",
      voucher."sourceMetadata"
    FROM "FinanceVoucher" AS voucher
    WHERE voucher."sourceSystem" = $1 AND voucher."sourceDatabase" = $2 AND voucher."sourceKey" = $3
  `, [SOURCE_SYSTEM, SOURCE_DATABASE, sourceKey]);
  if (result.rows.length > 1) fail(`consolidation voucher ${sourceKey} is not unique`);
  const voucher = result.rows[0];
  if (!voucher) return null;
  const items = await client.query(`
    SELECT
      item.id,
      item."accountId",
      item.debit,
      item.credit,
      item.description,
      item."relatedEntity",
      item."sortOrder",
      item."sourceSystem",
      item."sourceDatabase",
      item."sourceKey",
      item."sourceMetadata"
    FROM "FinanceVoucherItem" AS item
    WHERE item."voucherId" = $1
    ORDER BY item."sortOrder", item.id
  `, [voucher.id]);
  for (const item of items.rows) {
    const auxiliaries = await client.query(`
      SELECT
        link."sourceRole",
        member."companyCode",
        member."sourceSystem",
        member."dimensionType",
        member."sourceCode",
        member."sourceName",
        member."sourceLedger",
        company.code AS "linkedCompanyCode"
      FROM "FinanceVoucherItemAuxiliary" AS link
      JOIN "FinanceAuxiliaryMember" AS member ON member.id = link."memberId"
      LEFT JOIN "Company" AS company ON company.id = member."linkedCompanyId"
      WHERE link."itemId" = $1
      ORDER BY link.id
    `, [item.id]);
    item.auxiliaries = auxiliaries.rows;
  }
  voucher.items = items.rows;
  return voucher;
}

async function loadPrerequisites(client, input) {
  const voucher = input.voucher;
  const year = Number(voucher.date.slice(0, 4));
  const month = Number(voucher.date.slice(5, 7));
  const periodResult = await client.query(`
    SELECT id, "sourceKey" FROM "FinancePeriod"
    WHERE "companyCode" = $1 AND year = $2 AND month = $3
  `, [voucher.companyCode, year, month]);
  if (periodResult.rows.length !== 1 || periodResult.rows[0].sourceKey !== voucher.expectedPeriodSourceKey) {
    fail(`consolidation voucher period ${voucher.companyCode}:${year}-${month} differs from the private expectation`);
  }
  const accountCodes = [...new Set(voucher.items.map((item) => item.accountCode))];
  const accountResult = await client.query(`
    SELECT id, code, name, category, "balanceDirection", "sourceSystem", "sourceLedger", "sourceDatabase"
    FROM "FinanceAccount"
    WHERE "companyCode" = $1 AND year = $2 AND code = ANY($3::text[])
  `, [voucher.companyCode, year, accountCodes]);
  const accountsByCode = new Map(accountResult.rows.map((row) => [row.code, row]));
  for (const item of voucher.items) {
    const account = accountsByCode.get(item.accountCode);
    if (!account
      || account.name !== item.accountName
      || account.category !== item.category
      || account.balanceDirection !== item.balanceDirection
      || account.sourceSystem !== item.sourceSystem
      || account.sourceLedger !== item.sourceLedger
      || account.sourceDatabase !== item.sourceDatabase) {
      fail(`consolidation voucher account ${voucher.companyCode}:${year}:${item.accountCode} differs from the private expectation`);
    }
  }
  const linkedCodes = [...new Set(voucher.items.flatMap((item) => item.auxiliary ? [item.auxiliary.linkedCompanyCode] : []))];
  const companyResult = linkedCodes.length === 0 ? { rows: [] } : await client.query(`
    SELECT company.id, company.code, party.name
    FROM "Company" AS company
    JOIN "Party" AS party ON party.id = company."partyId"
    WHERE company.code = ANY($1::text[])
  `, [linkedCodes]);
  const companiesByCode = new Map(companyResult.rows.map((row) => [row.code, row]));
  for (const item of voucher.items) {
    if (!item.auxiliary) continue;
    const company = companiesByCode.get(item.auxiliary.linkedCompanyCode);
    if (!company || company.name !== item.auxiliary.sourceName) {
      fail(`consolidation voucher linked company ${item.auxiliary.linkedCompanyCode} differs from the private expectation`);
    }
  }
  return { period: periodResult.rows[0], accountsByCode, companiesByCode, year };
}

async function resolveAuxiliaryMember(client, voucher, auxiliary, linkedCompanyId, year) {
  const existing = await client.query(`
    SELECT id, "sourceName", "linkedCompanyId"
    FROM "FinanceAuxiliaryMember"
    WHERE "companyCode" = $1
      AND "sourceSystem" = $2
      AND "sourceLedger" = $3
      AND "dimensionType" = $4
      AND "sourceCode" = $5
  `, [voucher.companyCode, SOURCE_SYSTEM, auxiliary.sourceLedger, auxiliary.dimensionType, auxiliary.sourceCode]);
  if (existing.rows.length > 1) fail(`consolidation voucher auxiliary ${auxiliary.sourceCode} is not unique`);
  if (existing.rows[0]) {
    if (existing.rows[0].sourceName !== auxiliary.sourceName || existing.rows[0].linkedCompanyId !== linkedCompanyId) {
      fail(`consolidation voucher auxiliary ${auxiliary.sourceCode} differs from the private expectation`);
    }
    return existing.rows[0].id;
  }
  const inserted = await client.query(`
    INSERT INTO "FinanceAuxiliaryMember" (
      "companyCode", "sourceSystem", "sourceLedger", "dimensionType", "sourceCode", "sourceName",
      "firstYear", "lastYear", "linkedCompanyId", "companyLinkMethod", "companyLinkEvidence", "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, 'governed_data_release', $9, now(), now())
    RETURNING id
  `, [
    voucher.companyCode,
    SOURCE_SYSTEM,
    auxiliary.sourceLedger,
    auxiliary.dimensionType,
    auxiliary.sourceCode,
    auxiliary.sourceName,
    year,
    linkedCompanyId,
    `合并凭证 ${voucher.sourceKey} 明确绑定集团公司 ${auxiliary.linkedCompanyCode}`,
  ]);
  return inserted.rows[0].id;
}

export async function applyFinanceConsolidationVoucher(client, input) {
  const validated = validateFinanceConsolidationVoucherInput(input);
  const voucher = validated.voucher;
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`workspace-finance-consolidation-voucher:${voucher.sourceKey}`]);
    const prerequisites = await loadPrerequisites(client, validated);
    const existing = await loadExistingVoucher(client, voucher.sourceKey);
    if (existing) {
      assertExistingVoucherMatches(existing, validated, prerequisites.period, prerequisites.accountsByCode);
      await client.query("COMMIT");
      return { createdCount: 0, alreadyAppliedCount: 1, voucherId: existing.id };
    }
    const voucherNoCollision = await client.query(`
      SELECT id FROM "FinanceVoucher"
      WHERE "companyCode" = $1 AND "periodId" = $2 AND "voucherNo" = $3
    `, [voucher.companyCode, prerequisites.period.id, voucher.voucherNo]);
    if (voucherNoCollision.rows.length > 0) fail(`consolidation voucher number ${voucher.voucherNo} already exists`);

    const auxiliaryIds = new Map();
    for (const item of voucher.items) {
      if (!item.auxiliary) continue;
      const linkedCompany = prerequisites.companiesByCode.get(item.auxiliary.linkedCompanyCode);
      const key = JSON.stringify(item.auxiliary);
      if (!auxiliaryIds.has(key)) {
        auxiliaryIds.set(key, await resolveAuxiliaryMember(
          client,
          voucher,
          item.auxiliary,
          linkedCompany.id,
          prerequisites.year,
        ));
      }
    }
    const total = money(voucher.items.reduce((sum, item) => sum + item.debit, 0));
    const insertedVoucher = await client.query(`
      INSERT INTO "FinanceVoucher" (
        "voucherNo", date, "periodId", description, "totalDebit", "totalCredit", status, "companyCode",
        "sourceSystem", "sourceDatabase", "sourceKey", "voucherTypeCode", "voucherTypeName", "isAdjustment",
        "sourcePosted", "sourceAudited", "sourceInvalid", "sourceMetadata", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $5, 'posted', $6, $7, $8, $9, $10, $11, false, true, true, false, $12::jsonb, now(), now())
      RETURNING id
    `, [
      voucher.voucherNo,
      voucher.date,
      prerequisites.period.id,
      voucher.description,
      total,
      voucher.companyCode,
      SOURCE_SYSTEM,
      SOURCE_DATABASE,
      voucher.sourceKey,
      VOUCHER_TYPE_CODE,
      VOUCHER_TYPE_NAME,
      JSON.stringify({ kind: INPUT_KIND, evidence: voucher.evidence }),
    ]);
    const voucherId = insertedVoucher.rows[0].id;
    for (let index = 0; index < voucher.items.length; index += 1) {
      const item = voucher.items[index];
      const account = prerequisites.accountsByCode.get(item.accountCode);
      const insertedItem = await client.query(`
        INSERT INTO "FinanceVoucherItem" (
          "voucherId", "accountId", debit, credit, description, "relatedEntity", "sortOrder",
          "sourceSystem", "sourceDatabase", "sourceKey", "sourceMetadata"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        RETURNING id
      `, [
        voucherId,
        account.id,
        item.debit,
        item.credit,
        item.description,
        item.relatedEntity,
        index,
        SOURCE_SYSTEM,
        SOURCE_DATABASE,
        `${voucher.sourceKey}:${index + 1}`,
        JSON.stringify({ kind: INPUT_KIND, evidence: voucher.evidence }),
      ]);
      if (item.auxiliary) {
        const memberId = auxiliaryIds.get(JSON.stringify(item.auxiliary));
        await client.query(`
          INSERT INTO "FinanceVoucherItemAuxiliary" ("itemId", "memberId", "sourceRole")
          VALUES ($1, $2, $3)
        `, [insertedItem.rows[0].id, memberId, item.auxiliary.sourceRole]);
      }
    }
    await client.query("COMMIT");
    return { createdCount: 1, alreadyAppliedCount: 0, voucherId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  if (!process.argv.includes("--execute")) fail("repair requires --execute through the governed data-release handler");
  const inputFile = process.argv.find((argument) => argument.startsWith("--input-file="))?.slice(13);
  if (!inputFile || !path.isAbsolute(inputFile) || !fs.statSync(inputFile).isFile()) {
    fail("repair requires --input-file=<absolute-file>");
  }
  const input = validateFinanceConsolidationVoucherInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({
    connectionString: requireDatabaseUrl(),
    application_name: "workspace-finance-consolidation-voucher",
  });
  await client.connect();
  try {
    const result = await applyFinanceConsolidationVoucher(client, input);
    process.stdout.write(`${JSON.stringify({ completed: true, sourceKey: input.voucher.sourceKey, ...result })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
