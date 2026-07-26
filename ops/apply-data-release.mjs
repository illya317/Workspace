#!/usr/bin/env node

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import pg from "pg";

import { buildDataReleaseHandlerCommand } from "./data-release-handlers.mjs";
import { inspectStagedDataRelease } from "./data-release-transfer.mjs";

const { Client } = pg;
const RECEIPT_KEY_PREFIX = "data.release.receipt.";

function fail(message) {
  throw new Error(message);
}

function validateReadOnlyCheck(check, releaseId, ids) {
  if (!check || typeof check !== "object" || Array.isArray(check) || typeof check.id !== "string" || !check.id) {
    fail(`${releaseId} has an invalid check`);
  }
  if (ids.has(check.id)) fail(`${releaseId} repeats check id ${check.id}`);
  ids.add(check.id);
  if (typeof check.sql !== "string" || !/^(SELECT|WITH)\b/i.test(check.sql.trim()) || check.sql.includes(";")) {
    fail(`${releaseId}.${check.id} must be one SELECT/CTE statement without a semicolon`);
  }
  if (/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b/i.test(check.sql)) {
    fail(`${releaseId}.${check.id} contains a write-capable SQL keyword`);
  }
  if (typeof check.expected !== "string") fail(`${releaseId}.${check.id}.expected must be a string`);
  return { id: check.id, sql: check.sql, expected: check.expected };
}

export function validateExecutableManifest(manifest, expectedId) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || manifest.schemaVersion !== 2 || manifest.id !== expectedId) {
    fail(`${expectedId} requires a private schemaVersion 2 execution manifest`);
  }
  if (!Array.isArray(manifest.checks) || manifest.checks.length === 0) fail(`${expectedId} must declare post-apply checks`);
  const ids = new Set();
  return { ...manifest, checks: manifest.checks.map((check) => validateReadOnlyCheck(check, expectedId, ids)) };
}

function databaseUrl() {
  const value = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) fail("DIRECT_URL or DATABASE_URL must select PostgreSQL");
  return value;
}

function runHandler(command, repositoryRoot) {
  const result = spawnSync(command.executable, command.args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`data release handler failed with exit ${result.status ?? "unknown"}`);
}

async function recordChecks(manifest, descriptor) {
  const client = new Client({ connectionString: databaseUrl(), application_name: `workspace-data-release-${manifest.id}` });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`workspace-data-release:${manifest.id}`]);
    const results = [];
    for (const check of manifest.checks) {
      const result = await client.query(check.sql);
      if (result.rowCount !== 1 || result.fields.length !== 1) fail(`${manifest.id}.${check.id} must return one row and one column`);
      const value = result.rows[0][result.fields[0].name];
      const actual = value == null ? "" : String(value);
      if (actual !== check.expected) fail(`${manifest.id}.${check.id} expected ${check.expected}, received ${actual}`);
      results.push({ id: check.id, actual });
    }
    const receipt = {
      schemaVersion: 2,
      kind: "workspace-data-release-receipt",
      releaseId: manifest.id,
      payloadDigest: descriptor.payloadDigest,
      manifestSha256: descriptor.manifestSha256,
      target: "production",
      appliedAt: new Date().toISOString(),
      sourceCommit: process.env.WORKSPACE_DATA_RELEASE_SOURCE_SHA || null,
      checks: results,
    };
    await client.query(
      'INSERT INTO "SystemConfig" ("key", "value") VALUES ($1, $2) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"',
      [`${RECEIPT_KEY_PREFIX}${manifest.id}`, JSON.stringify(receipt)],
    );
    await client.query("COMMIT");
    return receipt;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) fail(`invalid argument: ${key ?? "<missing>"}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return { command, options };
}

function required(options, key) {
  if (!options[key]) fail(`--${key.replaceAll("_", "-")} is required`);
  return options[key];
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArguments(argv);
  if (command !== "apply" || options.target !== "production") {
    fail("usage: apply --target production --id ID --payload-digest SHA256 --bundle-root DIR --repository-root DIR");
  }
  const id = required(options, "id");
  const payloadDigest = required(options, "payload_digest");
  const bundleRoot = path.resolve(required(options, "bundle_root"));
  const repositoryRoot = path.resolve(required(options, "repository_root"));
  const descriptor = inspectStagedDataRelease({ bundleRoot, id });
  if (descriptor.payloadDigest !== payloadDigest) fail(`${id} uploaded payload digest differs from deployment metadata`);
  const manifestFile = path.join(bundleRoot, "manifest.json");
  const manifest = validateExecutableManifest(JSON.parse(readFileSync(manifestFile, "utf8")), id);
  const manifestSha256 = createHash("sha256").update(readFileSync(manifestFile)).digest("hex");
  if (manifestSha256 !== descriptor.manifestSha256) fail(`${id} manifest changed after upload verification`);
  const commandSpec = buildDataReleaseHandlerCommand(manifest.execution, {
    repositoryRoot,
    sourceRoot: path.join(bundleRoot, "sources"),
  });
  process.stdout.write(`==> 数据发布 handler: ${manifest.execution.handler}\n`);
  runHandler(commandSpec, repositoryRoot);
  const receipt = await recordChecks(manifest, descriptor);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
