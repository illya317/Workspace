#!/usr/bin/env node

import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";

const INPUT_KIND = "hr-organization-baseline-compatibility-repair";
const REPAIR_KEY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const ARCHIVE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/;

const AGGREGATES = {
  Department: {
    inputKey: "departmentId",
    anchorTable: "Department",
    versionTable: "DepartmentEffectiveVersion",
    aggregateColumn: "departmentId",
    payloadColumns: ["code", "name", "alias", "hierarchyKind", "level", "parentId", "managerPositionId"],
    baselineKeyPrefix: "migration:department:",
  },
  Position: {
    inputKey: "positionId",
    anchorTable: "Position",
    versionTable: "PositionEffectiveVersion",
    aggregateColumn: "positionId",
    payloadColumns: ["code", "name", "alias", "departmentId", "reportToPositionId"],
    baselineKeyPrefix: "migration:position:",
  },
};

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

function validateRows(rows, aggregateType) {
  const config = AGGREGATES[aggregateType];
  if (!Array.isArray(rows) || rows.length > 5000) fail(`${aggregateType} repairs must contain at most 5000 rows`);
  const ids = new Set();
  for (const row of rows) {
    if (!exactKeys(row, [
      config.inputKey,
      "baselineVersionId",
      "expectedArchiveTimestamp",
      "expectedSequence",
      "validToExclusive",
    ])) fail(`${aggregateType} repair row has invalid fields`);
    const aggregateId = row[config.inputKey];
    if (!positiveInteger(aggregateId) || ids.has(aggregateId)
      || !positiveInteger(row.baselineVersionId)
      || !positiveInteger(row.expectedSequence)
      || typeof row.expectedArchiveTimestamp !== "string"
      || !ARCHIVE_TIMESTAMP_PATTERN.test(row.expectedArchiveTimestamp)
      || !strictDate(row.validToExclusive)
      || row.expectedArchiveTimestamp.slice(0, 10) !== row.validToExclusive) {
      fail(`${aggregateType} repair row is invalid or duplicated`);
    }
    ids.add(aggregateId);
  }
  return rows;
}

export function validateHrOrganizationBaselineCompatibilityInput(value) {
  if (!exactKeys(value, ["actorUserId", "departments", "kind", "positions", "repairKey", "schemaVersion"])
    || value.schemaVersion !== 1 || value.kind !== INPUT_KIND
    || !positiveInteger(value.actorUserId) || !REPAIR_KEY_PATTERN.test(value.repairKey ?? "")) {
    fail("HR organization baseline compatibility input is invalid");
  }
  const departments = validateRows(value.departments, "Department");
  const positions = validateRows(value.positions, "Position");
  if (departments.length + positions.length === 0) fail("HR organization baseline compatibility input has no repairs");
  return value;
}

function quotedColumns(columns, prefix = "") {
  return columns.map((column) => `${prefix}"${column}"`).join(", ");
}

function payloadMatches(columns) {
  return columns.map((column) => `v."${column}" IS NOT DISTINCT FROM a."${column}"`).join(" AND ");
}

async function loadPinnedBaseline(client, aggregateType, row) {
  const config = AGGREGATES[aggregateType];
  const aggregateId = row[config.inputKey];
  const result = await client.query(`
    SELECT
      a.id,
      a.version,
      a."isArchived",
      a."archivedAt"::text AS "archiveTimestamp",
      a."endDate"::text AS "legacyEndDate",
      v.id AS "baselineVersionId",
      v.sequence,
      v."validFrom",
      v."validToExclusive",
      v."recordState",
      v."changeKind",
      v."supersedesId",
      c."idempotencyKey" AS "baselineIdempotencyKey",
      c."expectedSequence" AS "baselineExpectedSequence",
      (${payloadMatches(config.payloadColumns)}) AS "payloadMatches",
      EXISTS (SELECT 1 FROM "${config.versionTable}" successor WHERE successor."supersedesId" = v.id) AS "hasSuccessor"
    FROM "${config.anchorTable}" a
    JOIN "${config.versionTable}" v ON v."${config.aggregateColumn}" = a.id
    JOIN "OrganizationStructureChange" c ON c.id = v."sourceChangeId"
    WHERE a.id = $1 AND v.id = $2
    FOR UPDATE OF a, v
  `, [aggregateId, row.baselineVersionId]);
  if (result.rowCount !== 1) fail(`${aggregateType} ${aggregateId} baseline no longer exists`);
  const current = result.rows[0];
  if (current.version !== row.expectedSequence || current.isArchived !== true
    || current.archiveTimestamp !== row.expectedArchiveTimestamp || current.legacyEndDate !== null
    || current.baselineVersionId !== row.baselineVersionId || current.sequence !== row.expectedSequence
    || current.validFrom !== null || current.validToExclusive !== null
    || current.recordState !== "unknown" || current.changeKind !== "baseline"
    || current.supersedesId !== null || current.hasSuccessor !== false || current.payloadMatches !== true
    || current.baselineIdempotencyKey !== `${config.baselineKeyPrefix}${aggregateId}`
    || current.baselineExpectedSequence !== row.expectedSequence) {
    fail(`${aggregateType} ${aggregateId} changed after compatibility input was prepared`);
  }
}

async function appendEndDateVersions(client, aggregateType, row, actorUserId, repairKey) {
  const config = AGGREGATES[aggregateType];
  const aggregateId = row[config.inputKey];
  await loadPinnedBaseline(client, aggregateType, row);
  const changeId = randomUUID();
  const idempotencyKey = `data-release:hr-organization-baseline:${repairKey}:${aggregateType.toLowerCase()}:${aggregateId}`;
  const requestFingerprint = createHash("sha256").update(JSON.stringify({ aggregateType, ...row })).digest("hex");
  const createdSequences = [row.expectedSequence + 1, row.expectedSequence + 2];
  const change = await client.query(`
    INSERT INTO "OrganizationStructureChange" (
      id, "aggregateType", "aggregateId", "commandKind", "effectiveOn", "expectedSequence",
      "idempotencyKey", "requestFingerprint", reason, "effectManifestJson", "actorUserId"
    ) VALUES ($1, $2, $3, 'end-date', $4, $5, $6, $7, $8, $9, $10)
  `, [
    changeId,
    aggregateType,
    aggregateId,
    row.validToExclusive,
    row.expectedSequence,
    idempotencyKey,
    requestFingerprint,
    "旧库归档字段兼容投射：由 archivedAt 补齐组织结构 baseline 终止边界",
    JSON.stringify({
      repair: { kind: INPUT_KIND, repairKey, source: "archivedAt" },
      targetVersionId: row.baselineVersionId,
      createdSequences,
    }),
    actorUserId,
  ]);
  if (change.rowCount !== 1) fail(`${aggregateType} ${aggregateId} change ledger was not created`);

  const payloadInsertColumns = quotedColumns(config.payloadColumns);
  const payloadSelectColumns = quotedColumns(config.payloadColumns, "baseline.");
  const finiteVersion = await client.query(`
    INSERT INTO "${config.versionTable}" (
      "${config.aggregateColumn}", sequence, "validFrom", "validToExclusive", "recordState", "changeKind",
      "supersedesId", "sourceChangeId", ${payloadInsertColumns}, "createdBy"
    )
    SELECT $1, $2, NULL, $3, 'unknown', 'end-date', baseline.id, $4,
      ${payloadSelectColumns}, $5
    FROM "${config.versionTable}" baseline WHERE baseline.id = $6
  `, [aggregateId, createdSequences[0], row.validToExclusive, changeId, actorUserId, row.baselineVersionId]);
  if (finiteVersion.rowCount !== 1) fail(`${aggregateType} ${aggregateId} baseline disappeared during repair`);
  const cancelledVersion = await client.query(`
    INSERT INTO "${config.versionTable}" (
      "${config.aggregateColumn}", sequence, "validFrom", "validToExclusive", "recordState", "changeKind",
      "supersedesId", "sourceChangeId", ${payloadInsertColumns}, "createdBy"
    )
    SELECT $1, $2, $3, NULL, 'cancelled', 'end-date', baseline.id, $4,
      ${payloadSelectColumns}, $5
    FROM "${config.versionTable}" baseline WHERE baseline.id = $6
  `, [aggregateId, createdSequences[1], row.validToExclusive, changeId, actorUserId, row.baselineVersionId]);
  if (cancelledVersion.rowCount !== 1) fail(`${aggregateType} ${aggregateId} baseline disappeared during repair`);
  const updated = await client.query(`
    UPDATE "${config.anchorTable}"
    SET version = $1
    WHERE id = $2 AND version = $3 AND "isArchived" = true
      AND "archivedAt"::text = $4 AND "endDate" IS NULL
  `, [createdSequences[1], aggregateId, row.expectedSequence, row.expectedArchiveTimestamp]);
  if (updated.rowCount !== 1) fail(`${aggregateType} ${aggregateId} compatibility update lost a concurrent change`);
}

export async function repairHrOrganizationBaselineCompatibility(client, input) {
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const markerKey = `data.repair.hr.organization-baseline.${input.repairKey}`;
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [markerKey]);
    const prior = await client.query('SELECT "value" FROM "SystemConfig" WHERE "key" = $1', [markerKey]);
    if (prior.rowCount === 1) {
      const recorded = JSON.parse(prior.rows[0].value);
      if (recorded.inputDigest !== digest) fail(`repair marker ${input.repairKey} belongs to different input`);
      await client.query("COMMIT");
      return { ...recorded.result, alreadyApplied: true };
    }
    const actor = await client.query(`
      SELECT id FROM "User" WHERE id = $1 AND username = 'admin' AND "canLogin" = true
    `, [input.actorUserId]);
    if (actor.rowCount !== 1) fail("HR organization baseline compatibility repair requires the active root admin actor");

    for (const row of input.departments) {
      await appendEndDateVersions(client, "Department", row, input.actorUserId, input.repairKey);
    }
    for (const row of input.positions) {
      await appendEndDateVersions(client, "Position", row, input.actorUserId, input.repairKey);
    }

    const result = { repairedDepartments: input.departments.length, repairedPositions: input.positions.length };
    await client.query(`
      INSERT INTO "SystemConfig" ("key", "value") VALUES ($1, $2)
    `, [markerKey, JSON.stringify({ inputDigest: digest, result, appliedAt: new Date().toISOString() })]);
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
  const input = validateHrOrganizationBaselineCompatibilityInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({
    connectionString: requireDatabaseUrl(),
    application_name: "workspace-hr-organization-baseline-compatibility-repair",
  });
  await client.connect();
  try {
    const result = await repairHrOrganizationBaselineCompatibility(client, input);
    process.stdout.write(`${JSON.stringify({ completed: true, repairKey: input.repairKey, ...result })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
