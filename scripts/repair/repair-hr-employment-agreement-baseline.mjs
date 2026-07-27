#!/usr/bin/env node

import "dotenv/config";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import {
  employmentAgreementBaselineFieldRequired,
  employmentAgreementBaselineMissingFields,
} from "../../packages/hr/employment-agreement-baseline-contract.mjs";
import { requireDatabaseUrl } from "../lib/database-url.js";

const INPUT_KIND = "hr-employment-agreement-baseline";
const BASELINE_KEY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function strictDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function text(value) {
  if (value == null || value === "") return null;
  return String(value).trim() || null;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeLegacyRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value === "" ? null : value]));
}

function parseLegacyRecords(contracts, employmentId) {
  let parsed;
  try {
    parsed = JSON.parse(contracts);
  } catch {
    fail(`Employment ${employmentId} contracts is not valid JSON`);
  }
  const records = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
  if (records.length === 0 || records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) {
    fail(`Employment ${employmentId} contracts does not contain agreement objects`);
  }
  const normalized = records.map(normalizeLegacyRecord);
  const fingerprints = normalized.map((record) => sha256(stableJson(record)).slice(0, 24));
  if (new Set(fingerprints).size !== fingerprints.length) {
    fail(`Employment ${employmentId} contains duplicate agreements without stable identities`);
  }
  return normalized.map((record, index) => ({ record, fingerprint: fingerprints[index] }));
}

function optionalDate(value, label) {
  const normalized = text(value);
  if (normalized && !strictDate(normalized)) fail(`${label} is not a valid business date`);
  return normalized;
}

function agreementTerms(record, sourceRef) {
  const pairs = [
    [record.firstContractStartDate, record.firstContractEndDate, "initial"],
    [record.secondContractStartDate, record.secondContractEndDate, "renewal"],
    [record.thirdContractStartDate, record.thirdContractEndDate, "renewal"],
    [record.permanentContractDate, record.endDate, "permanent"],
  ];
  const terms = pairs.flatMap(([from, through, termKind], index) => {
    const effectiveFrom = optionalDate(from, `${sourceRef} term ${index + 1} start`);
    const effectiveThrough = optionalDate(through, `${sourceRef} term ${index + 1} end`);
    if (!effectiveFrom && !effectiveThrough) return [];
    if (effectiveFrom && effectiveThrough && effectiveFrom > effectiveThrough) {
      fail(`${sourceRef} term ${index + 1} starts after it ends`);
    }
    return [{
      sequence: index + 1,
      termKind,
      effectiveFrom,
      effectiveThrough,
      recordState: "confirmed",
    }];
  });
  return terms.length > 0 ? terms : [{
    sequence: 1,
    termKind: "initial",
    effectiveFrom: null,
    effectiveThrough: null,
    recordState: "confirmed",
  }];
}

function agreementContent(record) {
  return {
    company: text(record.company),
    insuranceStatus: text(record.insuranceStatus),
    legalRelation: text(record.legalRelation),
    contractType: text(record.contractType),
    employmentForm: text(record.employmentForm),
    confidentialityDate: optionalDate(record.confidentialityDate, "confidentialityDate"),
    nonCompeteDate: optionalDate(record.nonCompeteDate, "nonCompeteDate"),
    legacyBaseline: record,
  };
}

export function buildEmploymentAgreementBaselinePlan(sources) {
  const agreements = sources.flatMap((source) => parseLegacyRecords(source.contracts, source.employmentId).map(({ record, fingerprint }) => {
    const sourceRef = `employment:${source.employmentId}:${fingerprint}`;
    const terms = agreementTerms(record, sourceRef);
    const content = agreementContent(record);
    const missingFields = employmentAgreementBaselineMissingFields(content, terms);
    return {
      employmentId: source.employmentId,
      employeeId: source.employeeId,
      sourceRef,
      isPrimary: record.isPrimary === true,
      actualEndDate: optionalDate(record.endDate, `${sourceRef} actual end`),
      content,
      terms,
      dataQuality: { missingFields },
      incomplete: missingFields.some(employmentAgreementBaselineFieldRequired),
    };
  }));
  return {
    agreements,
    summary: {
      employments: sources.length,
      agreements: agreements.length,
      terms: agreements.reduce((count, agreement) => count + agreement.terms.length, 0),
      incompleteAgreements: agreements.filter((agreement) => agreement.incomplete).length,
      incompleteTerms: agreements.flatMap((agreement) => agreement.terms).filter((term) => !term.effectiveFrom).length,
    },
  };
}

export function validateHrEmploymentAgreementBaselineInput(value) {
  if (!exactKeys(value, ["actorUserId", "baselineKey", "expected", "kind", "schemaVersion", "sources"])
    || value.schemaVersion !== 1 || value.kind !== INPUT_KIND
    || !positiveInteger(value.actorUserId) || !BASELINE_KEY_PATTERN.test(value.baselineKey ?? "")
    || !exactKeys(value.expected, ["agreements", "employments", "incompleteAgreements", "incompleteTerms", "terms"])
    || Object.values(value.expected).some((count) => !Number.isInteger(count) || count < 0)
    || !Array.isArray(value.sources) || value.sources.length === 0 || value.sources.length > 5000) {
    fail("HR employment agreement baseline input is invalid");
  }
  const employmentIds = new Set();
  for (const source of value.sources) {
    if (!exactKeys(source, ["contractsSha256", "employeeId", "employmentId", "expectedVersion"])
      || !positiveInteger(source.employmentId) || !positiveInteger(source.employeeId)
      || !Number.isInteger(source.expectedVersion) || source.expectedVersion < 0
      || !/^[0-9a-f]{64}$/.test(source.contractsSha256)
      || employmentIds.has(source.employmentId)) {
      fail("HR employment agreement baseline sources contain an invalid or duplicate employment");
    }
    employmentIds.add(source.employmentId);
  }
  return value;
}

async function lockSources(client, input) {
  const sources = [];
  for (const expected of input.sources) {
    const result = await client.query(`
      SELECT id, "employeeId", version, contracts
      FROM "Employment" WHERE id = $1 FOR UPDATE
    `, [expected.employmentId]);
    const current = result.rows[0];
    if (result.rowCount !== 1 || current.employeeId !== expected.employeeId
      || current.version !== expected.expectedVersion || typeof current.contracts !== "string"
      || sha256(current.contracts) !== expected.contractsSha256) {
      fail(`Employment ${expected.employmentId} changed after the baseline input was prepared`);
    }
    sources.push({ employmentId: current.id, employeeId: current.employeeId, contracts: current.contracts });
  }
  return sources;
}

async function insertAgreement(client, agreement, input) {
  const existing = await client.query(`
    SELECT id FROM "EmploymentAgreement"
    WHERE "employmentId" = $1 AND "sourceKind" = 'legacy-baseline' AND "sourceRef" = $2
  `, [agreement.employmentId, agreement.sourceRef]);
  if (existing.rowCount !== 0) fail(`Agreement baseline ${agreement.sourceRef} already exists without its release marker`);
  const anchor = await client.query(`
    INSERT INTO "EmploymentAgreement"
      ("employmentId", "recordState", "isPrimary", "sourceKind", "sourceRef", "missingFieldsJson", "actualEndDate", reason, "createdBy", "updatedBy")
    VALUES ($1, 'confirmed', $2, 'legacy-baseline', $3, $4, $5, $6, $7, $7)
    RETURNING id
  `, [agreement.employmentId, agreement.isPrimary, agreement.sourceRef, JSON.stringify(agreement.dataQuality.missingFields), agreement.actualEndDate,
    `历史合同 baseline ${input.baselineKey}`, input.actorUserId]);
  const agreementId = anchor.rows[0].id;
  const revision = await client.query(`
    INSERT INTO "EmploymentAgreementRevision"
      ("agreementId", "revisionNo", "recordState", "contentJson", "sourceKind", "sourceRef", reason, "createdBy")
    VALUES ($1, 1, 'published', $2, 'legacy-baseline', $3, $4, $5)
    RETURNING id
  `, [agreementId, JSON.stringify(agreement.content), agreement.sourceRef, `历史合同 baseline ${input.baselineKey}`, input.actorUserId]);
  await client.query(`UPDATE "EmploymentAgreement" SET "currentPublishedRevisionId" = $1 WHERE id = $2`, [revision.rows[0].id, agreementId]);
  for (const term of agreement.terms) {
    await client.query(`
      INSERT INTO "EmploymentAgreementTerm"
        ("agreementId", sequence, "termKind", "effectiveFrom", "effectiveThrough", "recordState", "changeKind", "sourceKind", "sourceRef", reason, "createdBy")
      VALUES ($1, $2, $3, $4, $5, $6, 'legacy', 'legacy-baseline', $7, $8, $9)
    `, [agreementId, term.sequence, term.termKind, term.effectiveFrom, term.effectiveThrough, term.recordState,
      agreement.sourceRef, !term.effectiveFrom ? "历史合同开始日期待补充" : `历史合同 baseline ${input.baselineKey}`,
      input.actorUserId]);
  }
  await client.query(`
    INSERT INTO "EmploymentAgreementChange"
      ("employeeId", "agreementId", "commandKind", "idempotencyKey", "requestFingerprint", "effectManifestJson", "actorUserId")
    VALUES ($1, $2, 'baseline', $3, $4, $5, $6)
  `, [agreement.employeeId, agreementId, `hr-agreement-baseline:${input.baselineKey}:${agreement.sourceRef}`,
    sha256(stableJson(agreement)), JSON.stringify({ sourceRef: agreement.sourceRef, terms: agreement.terms.length, incomplete: agreement.incomplete }), input.actorUserId]);
}

export async function repairHrEmploymentAgreementBaseline(client, input) {
  const digest = sha256(JSON.stringify(input));
  const markerKey = `data.repair.hr.agreement.${input.baselineKey}`;
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
    if (actor.rowCount !== 1) fail("HR employment agreement baseline requires the active root admin actor");
    const plan = buildEmploymentAgreementBaselinePlan(await lockSources(client, input));
    if (Object.keys(plan.summary).some((key) => plan.summary[key] !== input.expected[key])) {
      fail("HR employment agreement baseline counts changed after preparation");
    }
    for (const agreement of plan.agreements) await insertAgreement(client, agreement, input);
    const result = { ...plan.summary };
    await client.query(`INSERT INTO "SystemConfig" ("key", "value") VALUES ($1, $2)`, [
      markerKey,
      JSON.stringify({ inputDigest: digest, result, appliedAt: new Date().toISOString() }),
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
  if (!inputFile || !path.isAbsolute(inputFile) || !fs.statSync(inputFile).isFile()) fail("repair requires --input-file=<absolute-file>");
  const input = validateHrEmploymentAgreementBaselineInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({ connectionString: requireDatabaseUrl(), application_name: "workspace-hr-employment-agreement-baseline" });
  await client.connect();
  try {
    const result = await repairHrEmploymentAgreementBaseline(client, input);
    process.stdout.write(`${JSON.stringify({ completed: true, baselineKey: input.baselineKey, ...result })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
