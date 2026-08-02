#!/usr/bin/env node

import "dotenv/config";

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { validateHrLifecycleCompatibilityRepairInput } from "./repair-hr-lifecycle-compatibility.mjs";

function fail(message) {
  throw new Error(message);
}

function option(name) {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function canonicalLooseDate(value) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value ?? "");
  if (!match) fail(`cannot normalize employment date ${JSON.stringify(value)}`);
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

export function buildHrLifecycleCompatibilityRelease(rows, options) {
  const repairInput = validateHrLifecycleCompatibilityRepairInput({
    schemaVersion: 1,
    kind: "hr-lifecycle-compatibility-repair",
    repairKey: options.repairKey,
    actorUserId: options.actorUserId,
    asOfDate: options.asOfDate,
    normalizeEmploymentDates: rows.normalizeEmploymentDates.map((row) => ({
      ...row,
      toJoinDate: canonicalLooseDate(row.fromJoinDate),
    })),
    inferLeaveDates: rows.inferLeaveDates,
    closeAssignments: rows.closeAssignments,
    markPrimaryAssignments: rows.markPrimaryAssignments,
  });
  const sourceText = `${JSON.stringify(repairInput, null, 2)}\n`;
  const sourceSha = createHash("sha256").update(sourceText).digest("hex");
  const stagedPath = "hr/lifecycle-compatibility.json";
  const inferredValues = repairInput.inferLeaveDates.length === 0
    ? "SELECT NULL::int AS id, NULL::text AS leave_date WHERE false"
    : `VALUES ${repairInput.inferLeaveDates.map((row) => `(${row.employmentId}, ${sqlString(row.inferredLeaveDate)})`).join(", ")}`;
  const manifest = {
    schemaVersion: 2,
    id: options.releaseId,
    execution: { handler: "hr-lifecycle-compatibility-v1", parameters: { inputFile: stagedPath } },
    sources: [{ id: "hr-lifecycle-compatibility", stagedPath, sha256: sourceSha }],
    checks: [
      {
        id: "repair-marker",
        sql: `SELECT count(*)::text FROM "SystemConfig" WHERE "key" = ${sqlString(`data.repair.hr.lifecycle.${options.repairKey}`)}`,
        expected: "1",
      },
      {
        id: "invalid-employment-dates",
        sql: `SELECT count(*)::text FROM "Employment" WHERE (NULLIF(btrim("joinDate"), '') IS NOT NULL AND NULLIF(btrim("joinDate"), '') !~ '^\\d{4}-\\d{2}-\\d{2}$') OR (NULLIF(btrim("leaveDate"), '') IS NOT NULL AND NULLIF(btrim("leaveDate"), '') !~ '^\\d{4}-\\d{2}-\\d{2}$')`,
        expected: "0",
      },
      {
        id: "assignments-after-employment",
        sql: `SELECT count(*)::text FROM "EmployeePosition" ep JOIN "Employment" em ON em."employeeId" = ep."employeeId" WHERE NULLIF(btrim(em."leaveDate"), '') ~ '^\\d{4}-\\d{2}-\\d{2}$' AND (NULLIF(btrim(ep."endDate"), '') IS NULL OR ep."endDate" > em."leaveDate")`,
        expected: "0",
      },
      {
        id: "inferred-leave-dates",
        sql: `WITH expected(id, leave_date) AS (${inferredValues}) SELECT count(*)::text FROM expected JOIN "Employment" em ON em.id = expected.id AND em."leaveDate" = expected.leave_date AND em."isActive" = false`,
        expected: String(repairInput.inferLeaveDates.length),
      },
      {
        id: "current-primary-count",
        sql: `WITH current_edp AS (SELECT ep."employeeId", count(*) AS assignments, count(*) FILTER (WHERE ep."isPrimary") AS primaries FROM "EmployeePosition" ep JOIN "Employment" em ON em."employeeId" = ep."employeeId" WHERE (NULLIF(btrim(em."joinDate"), '') IS NULL OR em."joinDate" <= ${sqlString(options.asOfDate)}) AND (NULLIF(btrim(em."leaveDate"), '') IS NULL OR em."leaveDate" >= ${sqlString(options.asOfDate)}) AND (NULLIF(btrim(ep."startDate"), '') IS NULL OR ep."startDate" <= ${sqlString(options.asOfDate)}) AND (NULLIF(btrim(ep."endDate"), '') IS NULL OR ep."endDate" >= ${sqlString(options.asOfDate)}) GROUP BY ep."employeeId") SELECT count(*)::text FROM current_edp WHERE assignments > 0 AND primaries <> 1`,
        expected: "0",
      },
      {
        id: "remaining-current-without-assignment",
        sql: `SELECT count(*)::text FROM "Employment" em WHERE ((NULLIF(btrim(em."joinDate"), '') IS NULL AND NULLIF(btrim(em."leaveDate"), '') IS NULL AND em."isActive") OR ((NULLIF(btrim(em."joinDate"), '') IS NULL OR em."joinDate" <= ${sqlString(options.asOfDate)}) AND (NULLIF(btrim(em."leaveDate"), '') IS NULL OR em."leaveDate" >= ${sqlString(options.asOfDate)}))) AND NOT EXISTS (SELECT 1 FROM "EmployeePosition" ep WHERE ep."employeeId" = em."employeeId" AND (NULLIF(btrim(ep."startDate"), '') IS NULL OR ep."startDate" <= ${sqlString(options.asOfDate)}) AND (NULLIF(btrim(ep."endDate"), '') IS NULL OR ep."endDate" >= ${sqlString(options.asOfDate)}))`,
        expected: String(options.expectedRemainingCurrentWithoutAssignment),
      },
    ],
  };
  return { repairInput, sourceText, manifest };
}

async function main() {
  const releaseId = option("release-id");
  const repairKey = option("repair-key");
  const asOfDate = option("as-of");
  const actorUserId = Number(option("actor-user-id"));
  const expectedRemainingCurrentWithoutAssignment = Number(option("expected-remaining-current-without-assignment"));
  if (!releaseId || !repairKey || !asOfDate || !Number.isInteger(actorUserId)
    || !Number.isInteger(expectedRemainingCurrentWithoutAssignment)) {
    fail("release-id, repair-key, as-of, actor-user-id, and expected-remaining-current-without-assignment are required");
  }
  let source = "";
  for await (const chunk of process.stdin) source += chunk;
  const built = buildHrLifecycleCompatibilityRelease(JSON.parse(source), {
    releaseId,
    repairKey,
    asOfDate,
    actorUserId,
    expectedRemainingCurrentWithoutAssignment,
  });
  const configRoot = process.env.WORKSPACE_CONFIG_DIR;
  if (!configRoot || !path.isAbsolute(configRoot)) fail("WORKSPACE_CONFIG_DIR is unavailable");
  const sourceDir = path.join(configRoot, "data-release-sources", releaseId, "hr");
  const manifestDir = path.join(configRoot, "data-release-manifests");
  mkdirSync(sourceDir, { recursive: true, mode: 0o700 });
  mkdirSync(manifestDir, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(sourceDir, "lifecycle-compatibility.json"), built.sourceText, { mode: 0o600 });
  writeFileSync(path.join(manifestDir, `${releaseId}.json`), `${JSON.stringify(built.manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    releaseId,
    normalizeEmploymentDates: built.repairInput.normalizeEmploymentDates.length,
    inferLeaveDates: built.repairInput.inferLeaveDates.length,
    closeAssignments: built.repairInput.closeAssignments.length,
    markPrimaryAssignments: built.repairInput.markPrimaryAssignments.length,
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
