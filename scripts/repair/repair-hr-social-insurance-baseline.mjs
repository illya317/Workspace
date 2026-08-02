#!/usr/bin/env node

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";
import { parseEmploymentLegacyItems, sha256, stableJson } from "./hr-employment-legacy-projection.mjs";

const KIND = "hr-social-insurance-baseline";
const STATUS = new Map([
  ["已参保", "insured"],
  ["已停保", "stopped"],
  ["未参保", "uninsured"],
  ["已退休", "retired"],
]);

function fail(message) {
  throw new Error(message);
}

function text(value) {
  return value == null ? null : String(value).trim() || null;
}

export function buildHrSocialInsuranceBaselinePlan(sources, companies) {
  const companyByName = new Map(companies.map((company) => [company.name, company.id]));
  const rows = [];
  const quarantine = [];
  for (const source of sources) {
    for (const item of parseEmploymentLegacyItems(source.contracts, source.employmentId)) {
      const record = item.record;
      const legacyStatus = text(record.insuranceStatus);
      const insuranceStatus = STATUS.get(legacyStatus);
      const sourceRef = `employment:${source.employmentId}:${item.fingerprint}:social-insurance`;
      if (!insuranceStatus) {
        quarantine.push({
          employmentId: source.employmentId,
          employeeId: source.employeeId,
          sourceRef,
          reasonCode: legacyStatus ? "invalid-required-field" : "missing-required-field",
          missingFields: ["insuranceStatus"],
          rawRecord: item.rawRecord,
          fieldProjection: item.fieldProjection,
        });
        continue;
      }
      const companyNameSnapshot = text(record.company);
      const companyId = companyNameSnapshot ? companyByName.get(companyNameSnapshot) ?? null : null;
      const missingFields = [];
      if ((insuranceStatus === "insured" || insuranceStatus === "stopped") && !companyId) missingFields.push("companyId");
      if (insuranceStatus === "insured" || insuranceStatus === "stopped") missingFields.push("startMonth");
      if (insuranceStatus === "stopped") missingFields.push("endMonth", "stopReason");
      rows.push({
        employeeId: source.employeeId,
        employmentId: source.employmentId,
        sourceRef,
        insuranceStatus,
        companyId,
        companyNameSnapshot,
        startMonth: null,
        endMonth: null,
        stopReason: null,
        missingFields,
        rawRecord: item.rawRecord,
        fieldProjection: item.fieldProjection,
      });
    }
  }
  const counts = Object.fromEntries(["insured", "stopped", "uninsured", "retired"].map((status) => [
    status,
    rows.filter((row) => row.insuranceStatus === status).length,
  ]));
  return {
    rows,
    quarantine,
    summary: {
      employments: sources.length,
      sourceItems: rows.length + quarantine.length,
      rows: rows.length,
      quarantined: quarantine.length,
      missingCompany: rows.filter((row) => row.missingFields.includes("companyId")).length,
      ...counts,
    },
  };
}

export function validateHrSocialInsuranceBaselineInput(value) {
  const expectedKeys = ["employments", "insured", "missingCompany", "quarantined", "retired", "rows", "sourceItems", "stopped", "uninsured"];
  if (!value || value.schemaVersion !== 1 || value.kind !== KIND
    || typeof value.baselineKey !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value.baselineKey)
    || !Number.isInteger(value.actorUserId) || value.actorUserId <= 0
    || !value.expected || Object.keys(value.expected).sort().join(",") !== expectedKeys.sort().join(",")
    || Object.values(value.expected).some((count) => !Number.isInteger(count) || count < 0)
    || !Array.isArray(value.sources) || value.sources.length === 0) {
    fail("HR social insurance baseline input is invalid");
  }
  const ids = new Set();
  for (const source of value.sources) {
    if (!Number.isInteger(source.employmentId) || !Number.isInteger(source.employeeId)
      || !Number.isInteger(source.expectedVersion) || !/^[0-9a-f]{64}$/.test(source.contractsSha256)
      || ids.has(source.employmentId)) {
      fail("HR social insurance baseline source is invalid or duplicated");
    }
    ids.add(source.employmentId);
  }
  return value;
}

function parsedMissingFields(value, sourceRef) {
  try {
    const fields = JSON.parse(value);
    if (!Array.isArray(fields) || fields.some((field) => typeof field !== "string")) throw new Error("invalid");
    return fields;
  } catch {
    fail(`existing social insurance baseline ${sourceRef} has invalid missingFieldsJson`);
  }
}

export function assertExistingSocialInsuranceRowsMatch(existingRows, plannedRows) {
  if (existingRows.length !== plannedRows.length) {
    fail(`existing social insurance baseline has ${existingRows.length} rows; expected ${plannedRows.length}`);
  }
  const existingBySourceRef = new Map(existingRows.map((row) => [row.sourceRef, row]));
  if (existingBySourceRef.size !== existingRows.length) fail("existing social insurance baseline repeats a sourceRef");
  for (const planned of plannedRows) {
    const existing = existingBySourceRef.get(planned.sourceRef);
    if (!existing) fail(`existing social insurance baseline is missing ${planned.sourceRef}`);
    const actual = {
      employeeId: existing.employeeId,
      insuranceStatus: existing.insuranceStatus,
      companyId: existing.companyId,
      companyNameSnapshot: existing.companyNameSnapshot,
      startMonth: existing.startMonth,
      endMonth: existing.endMonth,
      stopReason: existing.stopReason,
      missingFields: parsedMissingFields(existing.missingFieldsJson, planned.sourceRef),
    };
    const expected = {
      employeeId: planned.employeeId,
      insuranceStatus: planned.insuranceStatus,
      companyId: planned.companyId,
      companyNameSnapshot: planned.companyNameSnapshot,
      startMonth: planned.startMonth,
      endMonth: planned.endMonth,
      stopReason: planned.stopReason,
      missingFields: planned.missingFields,
    };
    if (stableJson(actual) !== stableJson(expected)) {
      fail(`existing social insurance baseline differs from the projection at ${planned.sourceRef}`);
    }
  }
}

async function lockedSources(client, input) {
  const result = [];
  for (const expected of input.sources) {
    const current = await client.query(`
      SELECT id, "employeeId", version, contracts
      FROM "Employment" WHERE id = $1 FOR UPDATE
    `, [expected.employmentId]);
    const row = current.rows[0];
    if (current.rowCount !== 1 || row.employeeId !== expected.employeeId
      || row.version !== expected.expectedVersion || typeof row.contracts !== "string"
      || sha256(row.contracts) !== expected.contractsSha256) {
      fail(`Employment ${expected.employmentId} changed after baseline preparation`);
    }
    result.push({ employmentId: row.id, employeeId: row.employeeId, contracts: row.contracts });
  }
  return result;
}

async function companyMaster(client) {
  const result = await client.query(`
    SELECT company.id, party.name
    FROM "Company" company JOIN "Party" party ON party.id = company."partyId"
  `);
  return result.rows;
}

async function insertRow(client, row, input) {
  const existing = await client.query(`
    SELECT id FROM "EmployeeSocialInsurancePeriod"
    WHERE "sourceKind" = 'legacy-baseline' AND "sourceRef" = $1
  `, [row.sourceRef]);
  if (existing.rowCount > 0) fail(`social insurance baseline ${row.sourceRef} already exists without its marker`);
  await client.query(`
    INSERT INTO "EmployeeSocialInsurancePeriod"
      ("periodUid", "employeeId", "insuranceStatus", "companyId", "companyNameSnapshot", "startMonth", "endMonth",
       "stopReason", "missingFieldsJson", "sourceKind", "sourceRef", note, "createdBy", "updatedBy")
    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'legacy-baseline', $9, $10, $11, $11)
  `, [
    row.employeeId,
    row.insuranceStatus,
    row.companyId,
    row.companyNameSnapshot,
    row.startMonth,
    row.endMonth,
    row.stopReason,
    JSON.stringify(row.missingFields),
    row.sourceRef,
    null,
    input.actorUserId,
  ]);
}

async function existingBaselineRows(client) {
  const result = await client.query(`
    SELECT "sourceRef", "employeeId", "insuranceStatus", "companyId", "companyNameSnapshot",
           "startMonth", "endMonth", "stopReason", "missingFieldsJson"
    FROM "EmployeeSocialInsurancePeriod"
    WHERE "sourceKind" = 'legacy-baseline'
    FOR UPDATE
  `);
  return result.rows;
}

export async function repairHrSocialInsuranceBaseline(client, input) {
  const markerKey = `data.repair.hr.social-insurance.${input.baselineKey}`;
  const digest = sha256(JSON.stringify(input));
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [markerKey]);
    const prior = await client.query('SELECT "value" FROM "SystemConfig" WHERE "key" = $1', [markerKey]);
    if (prior.rowCount === 1) {
      const recorded = JSON.parse(prior.rows[0].value);
      if (recorded.inputDigest !== digest) fail(`baseline marker ${input.baselineKey} belongs to different input`);
      await client.query("COMMIT");
      return { ...recorded.result, alreadyApplied: true };
    }
    const actor = await client.query(`SELECT id FROM "User" WHERE id = $1 AND username = 'admin' AND "canLogin" = true`, [input.actorUserId]);
    if (actor.rowCount !== 1) fail("HR social insurance baseline requires the active root admin actor");
    const plan = buildHrSocialInsuranceBaselinePlan(await lockedSources(client, input), await companyMaster(client));
    if (Object.keys(plan.summary).some((key) => plan.summary[key] !== input.expected[key])) {
      fail("HR social insurance baseline counts changed after preparation");
    }
    const existingRows = await existingBaselineRows(client);
    if (existingRows.length > 0) assertExistingSocialInsuranceRowsMatch(existingRows, plan.rows);
    else for (const row of plan.rows) await insertRow(client, row, input);
    await client.query(`INSERT INTO "SystemConfig" ("key", "value") VALUES ($1, $2)`, [
      markerKey,
      JSON.stringify({ inputDigest: digest, result: plan.summary, appliedAt: new Date().toISOString() }),
    ]);
    await client.query("COMMIT");
    return { ...plan.summary, alreadyApplied: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main() {
  if (!process.argv.includes("--execute")) fail("repair requires --execute through the governed data-release handler");
  const inputFile = process.argv.find((argument) => argument.startsWith("--input-file="))?.slice(13);
  if (!inputFile || !path.isAbsolute(inputFile) || !fs.statSync(inputFile).isFile()) fail("repair requires --input-file=<absolute-file>");
  const input = validateHrSocialInsuranceBaselineInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({ connectionString: requireDatabaseUrl(), application_name: "workspace-hr-social-insurance-baseline" });
  await client.connect();
  try {
    const result = await repairHrSocialInsuranceBaseline(client, input);
    process.stdout.write(`${JSON.stringify({ completed: true, baselineKey: input.baselineKey, ...result })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
