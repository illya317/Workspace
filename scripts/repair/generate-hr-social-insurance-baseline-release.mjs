#!/usr/bin/env node

import "dotenv/config";

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";
import {
  buildHrSocialInsuranceBaselinePlan,
  validateHrSocialInsuranceBaselineInput,
} from "./repair-hr-social-insurance-baseline.mjs";

function fail(message) {
  throw new Error(message);
}

function option(name) {
  return process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function loadPlan() {
  const client = new Client({ connectionString: requireDatabaseUrl(), application_name: "workspace-hr-social-insurance-baseline-generator" });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const [employments, companies] = await Promise.all([
      client.query(`
        SELECT id AS "employmentId", "employeeId", version AS "expectedVersion", contracts
        FROM "Employment" WHERE contracts IS NOT NULL ORDER BY id
      `),
      client.query(`
        SELECT company.id, party.name
        FROM "Company" company JOIN "Party" party ON party.id = company."partyId"
      `),
    ]);
    const sources = employments.rows.map((row) => ({
      ...row,
      contractsSha256: createHash("sha256").update(row.contracts).digest("hex"),
    }));
    const plan = buildHrSocialInsuranceBaselinePlan(sources, companies.rows);
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
  const { sources, summary } = await loadPlan();
  const input = validateHrSocialInsuranceBaselineInput({
    schemaVersion: 1,
    kind: "hr-social-insurance-baseline",
    baselineKey,
    actorUserId,
    expected: summary,
    sources: sources.map(({ contracts: _contracts, ...source }) => source),
  });
  const sourceText = `${JSON.stringify(input, null, 2)}\n`;
  const stagedPath = "hr/social-insurance-baseline.json";
  const sourceSha = createHash("sha256").update(sourceText).digest("hex");
  const markerKey = `data.repair.hr.social-insurance.${baselineKey}`;
  const manifest = {
    schemaVersion: 2,
    id: releaseId,
    execution: { handler: "hr-social-insurance-baseline-v1", parameters: { inputFile: stagedPath } },
    sources: [{ id: "hr-social-insurance-baseline", stagedPath, sha256: sourceSha }],
    checks: [
      { id: "baseline-marker", sql: `SELECT count(*)::text FROM "SystemConfig" WHERE "key" = ${sqlString(markerKey)}`, expected: "1" },
      { id: "baseline-rows", sql: `SELECT count(*)::text FROM "EmployeeSocialInsurancePeriod" WHERE "sourceKind" = 'legacy-baseline'`, expected: String(summary.rows) },
      { id: "baseline-insured", sql: `SELECT count(*)::text FROM "EmployeeSocialInsurancePeriod" WHERE "sourceKind" = 'legacy-baseline' AND "insuranceStatus" = 'insured'`, expected: String(summary.insured) },
    ],
  };
  const configRoot = process.env.WORKSPACE_CONFIG_DIR;
  if (!configRoot || !path.isAbsolute(configRoot)) fail("WORKSPACE_CONFIG_DIR is unavailable");
  const sourceDir = path.join(configRoot, "data-release-sources", releaseId, "hr");
  const manifestDir = path.join(configRoot, "data-release-manifests");
  mkdirSync(sourceDir, { recursive: true, mode: 0o700 });
  mkdirSync(manifestDir, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(sourceDir, "social-insurance-baseline.json"), sourceText, { mode: 0o600 });
  writeFileSync(path.join(manifestDir, `${releaseId}.json`), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ releaseId, baselineKey, ...summary }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
