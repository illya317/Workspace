#!/usr/bin/env node

import "dotenv/config";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";

const INPUT_KIND = "hr-lifecycle-compatibility-repair";
const REPAIR_KEY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

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

function canonicalLooseDate(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const normalized = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return strictDate(normalized) ? normalized : null;
}

function nextDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function validateUniqueRows(rows, key, label) {
  if (!Array.isArray(rows) || rows.length > 5000) fail(`${label} must be an array with at most 5000 rows`);
  const ids = new Set();
  for (const row of rows) {
    const id = row?.[key];
    if (!positiveInteger(id) || ids.has(id)) fail(`${label} contains an invalid or duplicate ${key}`);
    ids.add(id);
  }
  return rows;
}

export function validateHrLifecycleCompatibilityRepairInput(value) {
  if (!exactKeys(value, [
    "actorUserId",
    "asOfDate",
    "closeAssignments",
    "inferLeaveDates",
    "kind",
    "markPrimaryAssignments",
    "normalizeEmploymentDates",
    "repairKey",
    "schemaVersion",
  ]) || value.schemaVersion !== 1 || value.kind !== INPUT_KIND
    || !positiveInteger(value.actorUserId) || !strictDate(value.asOfDate)
    || !REPAIR_KEY_PATTERN.test(value.repairKey ?? "")) {
    fail("HR lifecycle compatibility repair input is invalid");
  }

  const normalizeEmploymentDates = validateUniqueRows(
    value.normalizeEmploymentDates,
    "employmentId",
    "normalizeEmploymentDates",
  );
  for (const row of normalizeEmploymentDates) {
    if (!exactKeys(row, ["employeeId", "employmentId", "expectedVersion", "fromJoinDate", "toJoinDate"])
      || !positiveInteger(row.employeeId) || !Number.isInteger(row.expectedVersion) || row.expectedVersion < 0
      || canonicalLooseDate(row.fromJoinDate) !== row.toJoinDate || !strictDate(row.toJoinDate)) {
      fail("normalizeEmploymentDates contains an invalid row");
    }
  }

  const inferLeaveDates = validateUniqueRows(value.inferLeaveDates, "employmentId", "inferLeaveDates");
  for (const row of inferLeaveDates) {
    if (!exactKeys(row, ["employeeId", "employmentId", "evidenceAssignmentIds", "expectedVersion", "inferredLeaveDate"])
      || !positiveInteger(row.employeeId) || !Number.isInteger(row.expectedVersion) || row.expectedVersion < 0
      || !strictDate(row.inferredLeaveDate) || !Array.isArray(row.evidenceAssignmentIds)
      || row.evidenceAssignmentIds.length === 0
      || row.evidenceAssignmentIds.some((id) => !positiveInteger(id))
      || new Set(row.evidenceAssignmentIds).size !== row.evidenceAssignmentIds.length) {
      fail("inferLeaveDates contains an invalid row");
    }
  }

  const closeAssignments = validateUniqueRows(value.closeAssignments, "assignmentId", "closeAssignments");
  for (const row of closeAssignments) {
    if (!exactKeys(row, ["assignmentId", "employeeId", "expectedVersion", "fromEndDate", "toEndDate"])
      || !positiveInteger(row.employeeId) || !Number.isInteger(row.expectedVersion) || row.expectedVersion < 0
      || (row.fromEndDate !== null && !strictDate(row.fromEndDate)) || !strictDate(row.toEndDate)
      || (row.fromEndDate !== null && row.fromEndDate <= row.toEndDate)) {
      fail("closeAssignments contains an invalid row");
    }
  }

  const markPrimaryAssignments = validateUniqueRows(
    value.markPrimaryAssignments,
    "assignmentId",
    "markPrimaryAssignments",
  );
  for (const row of markPrimaryAssignments) {
    if (!exactKeys(row, ["assignmentId", "employeeId", "expectedVersion"])
      || !positiveInteger(row.employeeId) || !Number.isInteger(row.expectedVersion) || row.expectedVersion < 0) {
      fail("markPrimaryAssignments contains an invalid row");
    }
  }

  if (normalizeEmploymentDates.length + inferLeaveDates.length + closeAssignments.length + markPrimaryAssignments.length === 0) {
    fail("HR lifecycle compatibility repair contains no operations");
  }
  return value;
}

async function ensureHistoryBaseline(client, entityType, tableName, entityId, actorUserId) {
  await client.query(`
    INSERT INTO "EditHistory" ("entityType", "entityId", "version", "dataJson", "editedBy", "tag")
    SELECT $1, $2::text, 0, to_jsonb(record)::text, $3, 'V0:baseline'
    FROM "${tableName}" AS record
    WHERE record.id = $2
      AND NOT EXISTS (
        SELECT 1 FROM "EditHistory" history
        WHERE history."entityType" = $1 AND history."entityId" = $2::text
          AND (history."tag" = 'V0:baseline' OR history."tag" IS NULL)
      )
    ON CONFLICT DO NOTHING
  `, [entityType, entityId, actorUserId]);
}

async function snapshotHistory(client, entityType, tableName, entityId, actorUserId) {
  await client.query(`
    WITH next_version AS (
      SELECT COALESCE(max(history.version) FILTER (WHERE history."tag" IS NULL), 0) + 1 AS version
      FROM "EditHistory" history
      WHERE history."entityType" = $1 AND history."entityId" = $2::text
    )
    INSERT INTO "EditHistory" ("entityType", "entityId", "version", "dataJson", "editedBy")
    SELECT $1, $2::text, next_version.version, to_jsonb(record)::text, $3
    FROM "${tableName}" AS record CROSS JOIN next_version
    WHERE record.id = $2
  `, [entityType, entityId, actorUserId]);
}

function assertOneRow(result, message) {
  if (result.rowCount !== 1) fail(message);
  return result.rows[0];
}

async function normalizeEmploymentDate(client, row, actorUserId) {
  const current = assertOneRow(await client.query(`
    SELECT id, "employeeId", version, "joinDate"
    FROM "Employment" WHERE id = $1 FOR UPDATE
  `, [row.employmentId]), `Employment ${row.employmentId} no longer exists`);
  if (current.employeeId !== row.employeeId || current.version !== row.expectedVersion || current.joinDate !== row.fromJoinDate) {
    fail(`Employment ${row.employmentId} changed after repair input was prepared`);
  }
  await ensureHistoryBaseline(client, "Employment", "Employment", row.employmentId, actorUserId);
  const updated = await client.query(`
    UPDATE "Employment"
    SET "joinDate" = $1, "editedBy" = $2, "editedAt" = now(), version = version + 1
    WHERE id = $3 AND "employeeId" = $4 AND version = $5 AND "joinDate" = $6
  `, [row.toJoinDate, actorUserId, row.employmentId, row.employeeId, row.expectedVersion, row.fromJoinDate]);
  if (updated.rowCount !== 1) fail(`Employment ${row.employmentId} normalization lost a concurrent update`);
  await snapshotHistory(client, "Employment", "Employment", row.employmentId, actorUserId);
}

async function inferEmploymentLeaveDate(client, row, actorUserId, repairKey) {
  const current = assertOneRow(await client.query(`
    SELECT id, "employeeId", version, "isActive", "joinDate", "leaveDate", "leaveReason", "leaveNote"
    FROM "Employment" WHERE id = $1 FOR UPDATE
  `, [row.employmentId]), `Employment ${row.employmentId} no longer exists`);
  if (current.employeeId !== row.employeeId || current.version !== row.expectedVersion
    || current.isActive !== false || !strictDate(current.joinDate) || current.leaveDate !== null
    || current.joinDate > row.inferredLeaveDate) {
    fail(`Employment ${row.employmentId} is not an inferable inactive legacy period`);
  }
  const evidence = await client.query(`
    SELECT id, "endDate" FROM "EmployeePosition"
    WHERE "employeeId" = $1 ORDER BY id FOR UPDATE
  `, [row.employeeId]);
  const actualIds = evidence.rows.map((item) => item.id);
  const expectedIds = [...row.evidenceAssignmentIds].sort((left, right) => left - right);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)
    || evidence.rows.some((item) => item.endDate !== row.inferredLeaveDate)) {
    fail(`Employment ${row.employmentId} assignment evidence changed after repair input was prepared`);
  }
  const blockers = await client.query(`
    SELECT
      (SELECT count(*)::int FROM "EmployeeLifecycleEvent"
        WHERE "employeeId" = $1 AND "eventType" = 'offboard') AS "offboardEvents",
      (SELECT count(*)::int FROM "EmployeeProject"
        WHERE "employeeId" = $1 AND "recordState" = 'confirmed'
          AND (NULLIF(btrim("endDate"), '') IS NULL OR "endDate" > $2)) AS "projectBlockers"
  `, [row.employeeId, row.inferredLeaveDate]);
  if (blockers.rows[0]?.offboardEvents !== 0 || blockers.rows[0]?.projectBlockers !== 0) {
    fail(`Employment ${row.employmentId} has lifecycle evidence that blocks inferred offboarding`);
  }
  await ensureHistoryBaseline(client, "Employment", "Employment", row.employmentId, actorUserId);
  const updated = await client.query(`
    UPDATE "Employment"
    SET "leaveDate" = $1, "editedBy" = $2, "editedAt" = now(), version = version + 1
    WHERE id = $3 AND "employeeId" = $4 AND version = $5 AND "isActive" = false AND "leaveDate" IS NULL
  `, [row.inferredLeaveDate, actorUserId, row.employmentId, row.employeeId, row.expectedVersion]);
  if (updated.rowCount !== 1) fail(`Employment ${row.employmentId} inferred offboarding lost a concurrent update`);
  await snapshotHistory(client, "Employment", "Employment", row.employmentId, actorUserId);
  await client.query(`
    INSERT INTO "EmployeeLifecycleEvent"
      ("employeeId", "eventType", "effectiveDate", reason, "detailsJson", "recordedByUserId")
    VALUES ($1, 'offboard', $2, $3, $4, $5)
  `, [
    row.employeeId,
    nextDate(row.inferredLeaveDate),
    "历史数据自动修复：由全部岗位的共同截止日推导离职日",
    JSON.stringify({
      repair: { kind: INPUT_KIND, repairKey, inferredFrom: "common_assignment_end_date" },
      sourceAssignmentId: null,
      createdAssignmentIds: [],
      cancelledAssignmentIds: [],
      closedAssignmentIds: expectedIds,
      cancelledProjectMembershipIds: [],
      employmentId: row.employmentId,
      assignmentEndDate: null,
      targetAssignment: null,
      employmentFields: { leaveReason: current.leaveReason, leaveNote: current.leaveNote },
    }),
    actorUserId,
  ]);
}

async function closeAssignment(client, row, actorUserId) {
  const current = assertOneRow(await client.query(`
    SELECT id, "employeeId", version, "startDate", "endDate"
    FROM "EmployeePosition" WHERE id = $1 FOR UPDATE
  `, [row.assignmentId]), `EDP ${row.assignmentId} no longer exists`);
  if (current.employeeId !== row.employeeId || current.version !== row.expectedVersion
    || current.endDate !== row.fromEndDate || (current.startDate && current.startDate > row.toEndDate)) {
    fail(`EDP ${row.assignmentId} changed after repair input was prepared`);
  }
  const matchingEmployment = await client.query(`
    SELECT count(*)::int AS count FROM "Employment"
    WHERE "employeeId" = $1 AND "leaveDate" = $2
  `, [row.employeeId, row.toEndDate]);
  if (matchingEmployment.rows[0]?.count !== 1) {
    fail(`EDP ${row.assignmentId} does not have exactly one matching ended Employment`);
  }
  await ensureHistoryBaseline(client, "EDP", "EmployeePosition", row.assignmentId, actorUserId);
  const updated = await client.query(`
    UPDATE "EmployeePosition"
    SET "endDate" = $1, "editedBy" = $2, "editedAt" = now(), version = version + 1
    WHERE id = $3 AND "employeeId" = $4 AND version = $5
      AND "endDate" IS NOT DISTINCT FROM $6
  `, [row.toEndDate, actorUserId, row.assignmentId, row.employeeId, row.expectedVersion, row.fromEndDate]);
  if (updated.rowCount !== 1) fail(`EDP ${row.assignmentId} closure lost a concurrent update`);
  await snapshotHistory(client, "EDP", "EmployeePosition", row.assignmentId, actorUserId);
}

async function markPrimaryAssignment(client, row, actorUserId, asOfDate) {
  const current = assertOneRow(await client.query(`
    SELECT id, "employeeId", version, "isPrimary"
    FROM "EmployeePosition" WHERE id = $1 FOR UPDATE
  `, [row.assignmentId]), `EDP ${row.assignmentId} no longer exists`);
  if (current.employeeId !== row.employeeId || current.version !== row.expectedVersion || current.isPrimary !== false) {
    fail(`EDP ${row.assignmentId} changed after repair input was prepared`);
  }
  const facts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM "Employment"
       WHERE "employeeId" = $1
         AND (NULLIF(btrim("joinDate"), '') IS NULL OR "joinDate" <= $2)
         AND (NULLIF(btrim("leaveDate"), '') IS NULL OR "leaveDate" >= $2)) AS employments,
      (SELECT count(*)::int FROM "EmployeePosition"
       WHERE "employeeId" = $1
         AND (NULLIF(btrim("startDate"), '') IS NULL OR "startDate" <= $2)
         AND (NULLIF(btrim("endDate"), '') IS NULL OR "endDate" >= $2)) AS assignments,
      (SELECT min(id)::int FROM "EmployeePosition"
       WHERE "employeeId" = $1
         AND (NULLIF(btrim("startDate"), '') IS NULL OR "startDate" <= $2)
         AND (NULLIF(btrim("endDate"), '') IS NULL OR "endDate" >= $2)) AS "assignmentId"
  `, [row.employeeId, asOfDate]);
  if (facts.rows[0]?.employments !== 1 || facts.rows[0]?.assignments !== 1
    || facts.rows[0]?.assignmentId !== row.assignmentId) {
    fail(`EDP ${row.assignmentId} is no longer the sole current assignment`);
  }
  await ensureHistoryBaseline(client, "EDP", "EmployeePosition", row.assignmentId, actorUserId);
  const updated = await client.query(`
    UPDATE "EmployeePosition"
    SET "isPrimary" = true, "editedBy" = $1, "editedAt" = now(), version = version + 1
    WHERE id = $2 AND "employeeId" = $3 AND version = $4 AND "isPrimary" = false
  `, [actorUserId, row.assignmentId, row.employeeId, row.expectedVersion]);
  if (updated.rowCount !== 1) fail(`EDP ${row.assignmentId} primary repair lost a concurrent update`);
  await snapshotHistory(client, "EDP", "EmployeePosition", row.assignmentId, actorUserId);
}

export async function repairHrLifecycleCompatibility(client, input) {
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const markerKey = `data.repair.hr.lifecycle.${input.repairKey}`;
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
    if (actor.rowCount !== 1) fail("HR lifecycle compatibility repair requires the active root admin actor");

    for (const row of input.normalizeEmploymentDates) await normalizeEmploymentDate(client, row, input.actorUserId);
    for (const row of input.inferLeaveDates) await inferEmploymentLeaveDate(client, row, input.actorUserId, input.repairKey);
    for (const row of input.closeAssignments) await closeAssignment(client, row, input.actorUserId);
    for (const row of input.markPrimaryAssignments) await markPrimaryAssignment(client, row, input.actorUserId, input.asOfDate);

    const result = {
      normalizedEmploymentDates: input.normalizeEmploymentDates.length,
      inferredLeaveDates: input.inferLeaveDates.length,
      closedAssignments: input.closeAssignments.length,
      markedPrimaryAssignments: input.markPrimaryAssignments.length,
    };
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
  const input = validateHrLifecycleCompatibilityRepairInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({
    connectionString: requireDatabaseUrl(),
    application_name: "workspace-hr-lifecycle-compatibility-repair",
  });
  await client.connect();
  try {
    const result = await repairHrLifecycleCompatibility(client, input);
    process.stdout.write(`${JSON.stringify({ completed: true, repairKey: input.repairKey, ...result })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
