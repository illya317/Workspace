#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";

const INPUT_KIND = "finance-reviewed-origin-mapping-repair";

function fail(message) {
  throw new Error(message);
}

export function validateFinanceReviewedOriginMappingRepairInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schemaVersion !== 1 || value.kind !== INPUT_KIND
    || !Number.isInteger(value.policyVersionId) || value.policyVersionId <= 0
    || !Array.isArray(value.rows) || value.rows.length === 0 || value.rows.length > 5000
    || Object.keys(value).sort().join(",") !== "kind,policyVersionId,rows,schemaVersion") {
    fail("finance reviewed-origin mapping repair input is invalid");
  }
  const keys = new Set();
  for (const row of value.rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)
      || Object.keys(row).sort().join(",") !== "companyCode,groupAccountId,localAccountCode,sourceScopeKey"
      || !Number.isInteger(row.groupAccountId) || row.groupAccountId <= 0
      || typeof row.companyCode !== "string" || !row.companyCode
      || typeof row.sourceScopeKey !== "string" || !row.sourceScopeKey
      || typeof row.localAccountCode !== "string" || !row.localAccountCode) {
      fail("finance reviewed-origin mapping repair row is invalid");
    }
    const key = `${row.groupAccountId}\0${row.companyCode}\0${row.sourceScopeKey}\0${row.localAccountCode}`;
    if (keys.has(key)) fail("finance reviewed-origin mapping repair rows contain a duplicate");
    keys.add(key);
  }
  return value;
}

export async function repairFinanceReviewedOriginMappings(client, input) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `workspace-finance-reviewed-origin-mappings:${input.policyVersionId}`,
    ]);
    const requestedRows = JSON.stringify(input.rows);
    const candidates = await client.query(`
      WITH requested AS (
        SELECT * FROM jsonb_to_recordset($2::jsonb) AS item(
          "groupAccountId" int,
          "companyCode" text,
          "sourceScopeKey" text,
          "localAccountCode" text
        )
      )
      SELECT
        count(*)::int AS "candidateCount",
        count(*) FILTER (WHERE mapping."mappingMethod" = 'suggested')::int AS "suggestedCount"
      FROM requested
      JOIN "FinanceGroupAccountMapping" AS mapping
        ON mapping."policyVersionId" = $1
       AND mapping."groupAccountId" = requested."groupAccountId"
       AND mapping."companyCode" = requested."companyCode"
       AND mapping."sourceScopeKey" = requested."sourceScopeKey"
       AND mapping."localAccountCode" = requested."localAccountCode"
      JOIN "FinanceGroupAccountRevision" AS revision
        ON revision."policyVersionId" = mapping."policyVersionId"
       AND revision."groupAccountId" = mapping."groupAccountId"
      JOIN "FinanceGroupAccount" AS group_account
        ON group_account.id = revision."groupAccountId"
      WHERE revision."reviewStatus" = 'reviewed'
        AND group_account."sourceKind" = 'suggested'
        AND mapping."companyCode" = group_account."originCompanyCode"
        AND mapping."sourceScopeKey" = group_account."originSourceScopeKey"
        AND mapping."localAccountCode" = group_account."originLocalAccountCode"
        AND mapping."mappingMethod" IN ('suggested', 'manual_override')
    `, [input.policyVersionId, requestedRows]);
    const candidateCount = Number(candidates.rows[0]?.candidateCount ?? -1);
    const suggestedCount = Number(candidates.rows[0]?.suggestedCount ?? -1);
    if (candidateCount !== input.rows.length) {
      fail(`expected ${input.rows.length} reviewed origin mappings, received ${candidateCount}`);
    }
    const updated = await client.query(`
      WITH requested AS (
        SELECT * FROM jsonb_to_recordset($2::jsonb) AS item(
          "groupAccountId" int,
          "companyCode" text,
          "sourceScopeKey" text,
          "localAccountCode" text
        )
      )
      UPDATE "FinanceGroupAccountMapping" AS mapping
      SET "mappingMethod" = 'manual_override', "updatedAt" = now()
      FROM requested, "FinanceGroupAccountRevision" AS revision, "FinanceGroupAccount" AS group_account
      WHERE mapping."policyVersionId" = $1
        AND mapping."groupAccountId" = requested."groupAccountId"
        AND mapping."companyCode" = requested."companyCode"
        AND mapping."sourceScopeKey" = requested."sourceScopeKey"
        AND mapping."localAccountCode" = requested."localAccountCode"
        AND revision."policyVersionId" = mapping."policyVersionId"
        AND revision."groupAccountId" = mapping."groupAccountId"
        AND revision."reviewStatus" = 'reviewed'
        AND group_account.id = revision."groupAccountId"
        AND group_account."sourceKind" = 'suggested'
        AND mapping."companyCode" = group_account."originCompanyCode"
        AND mapping."sourceScopeKey" = group_account."originSourceScopeKey"
        AND mapping."localAccountCode" = group_account."originLocalAccountCode"
        AND mapping."mappingMethod" = 'suggested'
    `, [input.policyVersionId, requestedRows]);
    if (updated.rowCount !== suggestedCount) fail("reviewed origin mapping repair changed an unexpected row count");
    await client.query("COMMIT");
    return { candidateCount, updatedCount: updated.rowCount, alreadyConfirmedCount: candidateCount - suggestedCount };
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
  const input = validateFinanceReviewedOriginMappingRepairInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({
    connectionString: requireDatabaseUrl(),
    application_name: "workspace-finance-reviewed-origin-mapping-repair",
  });
  await client.connect();
  try {
    const result = await repairFinanceReviewedOriginMappings(client, input);
    process.stdout.write(`${JSON.stringify({ completed: true, policyVersionId: input.policyVersionId, ...result })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
