#!/usr/bin/env node

import "dotenv/config";

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";
import {
  buildEmploymentAgreementBaselinePlan,
  validateHrEmploymentAgreementBaselineInput,
} from "./repair-hr-employment-agreement-baseline.mjs";

function fail(message) {
  throw new Error(message);
}

function option(name) {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function loadSources() {
  const client = new Client({ connectionString: requireDatabaseUrl(), application_name: "workspace-hr-agreement-baseline-generator" });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await client.query(`
      SELECT id AS "employmentId", "employeeId", version AS "expectedVersion", contracts
      FROM "Employment"
      WHERE contracts IS NOT NULL
      ORDER BY id
    `);
    const sources = result.rows.map((row) => ({
      employmentId: row.employmentId,
      employeeId: row.employeeId,
      expectedVersion: row.expectedVersion,
      contracts: row.contracts,
      contractsSha256: createHash("sha256").update(row.contracts).digest("hex"),
    }));
    const plan = buildEmploymentAgreementBaselinePlan(sources);
    await client.query("ROLLBACK");
    return { sources, summary: plan.summary };
  } finally {
    await client.end();
  }
}

async function main() {
  const releaseId = option("release-id");
  const baselineKey = option("baseline-key");
  const actorUserId = Number(option("actor-user-id"));
  if (!releaseId || !baselineKey || !Number.isInteger(actorUserId) || actorUserId <= 0) {
    fail("release-id, baseline-key, and actor-user-id are required");
  }
  const { sources, summary } = await loadSources();
  if (summary.agreements === 0) fail("no legacy employment agreements were found");
  const input = validateHrEmploymentAgreementBaselineInput({
    schemaVersion: 1,
    kind: "hr-employment-agreement-baseline",
    baselineKey,
    actorUserId,
    expected: summary,
    sources: sources.map(({ contracts: _contracts, ...source }) => source),
  });
  const sourceText = `${JSON.stringify(input, null, 2)}\n`;
  const stagedPath = "hr/employment-agreement-baseline.json";
  const sourceSha = createHash("sha256").update(sourceText).digest("hex");
  const markerKey = `data.repair.hr.agreement.${baselineKey}`;
  const manifest = {
    schemaVersion: 2,
    id: releaseId,
    execution: { handler: "hr-employment-agreement-baseline-v1", parameters: { inputFile: stagedPath } },
    sources: [{ id: "hr-employment-agreement-baseline", stagedPath, sha256: sourceSha }],
    checks: [
      {
        id: "baseline-marker",
        sql: `SELECT count(*)::text FROM "SystemConfig" WHERE "key" = ${sqlString(markerKey)}`,
        expected: "1",
      },
      {
        id: "baseline-agreements",
        sql: `SELECT count(*)::text FROM "EmploymentAgreement" WHERE "sourceKind" = 'legacy-baseline'`,
        expected: String(summary.agreements),
      },
      {
        id: "baseline-terms",
        sql: `SELECT count(*)::text FROM "EmploymentAgreementTerm" WHERE "sourceKind" = 'legacy-baseline'`,
        expected: String(summary.terms),
      },
      {
        id: "baseline-incomplete-terms",
        sql: `SELECT count(*)::text FROM "EmploymentAgreementTerm" WHERE "sourceKind" = 'legacy-baseline' AND "effectiveFrom" IS NULL`,
        expected: String(summary.incompleteTerms),
      },
      {
        id: "baseline-unknown-record-states",
        sql: `SELECT count(*)::text FROM "EmploymentAgreementTerm" WHERE "sourceKind" = 'legacy-baseline' AND "recordState" = 'unknown'`,
        expected: "0",
      },
    ],
  };
  const configRoot = process.env.WORKSPACE_CONFIG_DIR;
  if (!configRoot || !path.isAbsolute(configRoot)) fail("WORKSPACE_CONFIG_DIR is unavailable");
  const sourceDir = path.join(configRoot, "data-release-sources", releaseId, "hr");
  const manifestDir = path.join(configRoot, "data-release-manifests");
  mkdirSync(sourceDir, { recursive: true, mode: 0o700 });
  mkdirSync(manifestDir, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(sourceDir, "employment-agreement-baseline.json"), sourceText, { mode: 0o600 });
  writeFileSync(path.join(manifestDir, `${releaseId}.json`), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ releaseId, baselineKey, ...summary }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
