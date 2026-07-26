#!/usr/bin/env node

import "dotenv/config";

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";

const { Client } = pg;
const RELEASE_ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/;
const RECEIPT_KEY_PREFIX = "data.release.receipt.";
const RECEIPT_KIND = "workspace-data-release-receipt";
const ALLOWED_TARGETS = new Set(["local", "production"]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    fail(`${label} must be an array of non-empty strings`);
  }
  return value;
}

function validateReadOnlyCheck(check, releaseId, seen) {
  if (!check || typeof check !== "object" || Array.isArray(check)) fail(`${releaseId} has an invalid check`);
  const id = requireString(check.id, `${releaseId} check id`);
  if (seen.has(id)) fail(`${releaseId} repeats check id ${id}`);
  seen.add(id);
  const sql = requireString(check.sql, `${releaseId}.${id} sql`).trim();
  if (!/^(SELECT|WITH)\b/i.test(sql)) fail(`${releaseId}.${id} must be a SELECT/CTE query`);
  if (sql.includes(";")) fail(`${releaseId}.${id} must contain exactly one statement without a semicolon`);
  if (/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b/i.test(sql)) {
    fail(`${releaseId}.${id} contains a write-capable SQL keyword`);
  }
  requireString(check.expected, `${releaseId}.${id} expected`);
  return { id, sql, expected: check.expected };
}

export function validateManifest(manifest, { file, repositoryRoot = process.cwd() } = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail(`${file ?? "manifest"} must contain an object`);
  if (manifest.schemaVersion !== 1) fail(`${file ?? "manifest"} requires schemaVersion 1`);
  if (!RELEASE_ID_PATTERN.test(manifest.id ?? "")) fail(`${file ?? "manifest"} has an invalid release id`);
  requireString(manifest.title, `${manifest.id} title`);
  requireString(manifest.description, `${manifest.id} description`);
  if (manifest.mode !== "maintenance" && manifest.mode !== "online") fail(`${manifest.id} mode must be maintenance or online`);
  if (manifest.requiredForProduction !== true) fail(`${manifest.id} must explicitly set requiredForProduction=true`);
  if (manifest.sourceCompleteness !== "complete" && manifest.sourceCompleteness !== "incomplete") {
    fail(`${manifest.id} sourceCompleteness must be complete or incomplete`);
  }

  const migrations = requireStringArray(manifest.requiredMigrations, `${manifest.id} requiredMigrations`);
  for (const migration of migrations) {
    if (!MIGRATION_PATTERN.test(migration)) fail(`${manifest.id} has an invalid migration name: ${migration}`);
    const migrationFile = path.join(repositoryRoot, "prisma", "migrations", migration, "migration.sql");
    if (!existsSync(migrationFile)) fail(`${manifest.id} references a missing migration: ${migration}`);
  }

  if (!Array.isArray(manifest.operations) || manifest.operations.length === 0) fail(`${manifest.id} must declare operations`);
  const operationIds = new Set();
  for (const operation of manifest.operations) {
    const operationId = requireString(operation?.id, `${manifest.id} operation id`);
    if (operationIds.has(operationId)) fail(`${manifest.id} repeats operation id ${operationId}`);
    operationIds.add(operationId);
    requireString(operation.description, `${manifest.id}.${operationId} description`);
    const script = requireString(operation.script, `${manifest.id}.${operationId} script`);
    if (path.isAbsolute(script) || script.split(path.sep).includes("..")) fail(`${manifest.id}.${operationId} script must stay inside the repository`);
    if (!existsSync(path.join(repositoryRoot, script))) fail(`${manifest.id}.${operationId} script is missing: ${script}`);
    requireStringArray(operation.sourceIds, `${manifest.id}.${operationId} sourceIds`);
    const args = operation.args === undefined ? [] : requireStringArray(operation.args, `${manifest.id}.${operationId} args`);
    if (args.some((argument) => argument.includes("\0"))) fail(`${manifest.id}.${operationId} args contain a null byte`);
  }

  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) fail(`${manifest.id} must declare sources`);
  const sourceIds = new Set();
  for (const source of manifest.sources) {
    const sourceId = requireString(source?.id, `${manifest.id} source id`);
    if (sourceIds.has(sourceId)) fail(`${manifest.id} repeats source id ${sourceId}`);
    sourceIds.add(sourceId);
    requireString(source.label, `${manifest.id}.${sourceId} label`);
    const locationHint = requireString(source.locationHint, `${manifest.id}.${sourceId} locationHint`);
    if (!SHA256_PATTERN.test(source.sha256 ?? "")) fail(`${manifest.id}.${sourceId} has an invalid sha256`);
    if (locationHint.startsWith("repository:")) {
      const relativePath = locationHint.slice("repository:".length);
      if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(path.sep).includes("..")) {
        fail(`${manifest.id}.${sourceId} has an invalid repository source path`);
      }
      const sourceFile = path.join(repositoryRoot, relativePath);
      if (!existsSync(sourceFile)) fail(`${manifest.id}.${sourceId} repository source is missing: ${relativePath}`);
      if (sha256(readFileSync(sourceFile)) !== source.sha256) fail(`${manifest.id}.${sourceId} repository source sha256 drifted: ${relativePath}`);
    } else if (locationHint.startsWith("private:")) {
      if (source.stagedPath !== undefined) {
        const stagedPath = requireString(source.stagedPath, `${manifest.id}.${sourceId} stagedPath`);
        if (path.isAbsolute(stagedPath) || stagedPath.split(path.sep).includes("..")) {
          fail(`${manifest.id}.${sourceId} stagedPath must stay inside its private release source root`);
        }
      }
    } else {
      fail(`${manifest.id}.${sourceId} locationHint must use repository: or private:`);
    }
  }
  for (const operation of manifest.operations) {
    for (const sourceId of operation.sourceIds) {
      if (!sourceIds.has(sourceId)) fail(`${manifest.id}.${operation.id} references unknown source ${sourceId}`);
    }
  }

  if (!Array.isArray(manifest.checks) || manifest.checks.length === 0) fail(`${manifest.id} must declare checks`);
  const checkIds = new Set();
  const checks = manifest.checks.map((check) => validateReadOnlyCheck(check, manifest.id, checkIds));
  return { ...manifest, requiredMigrations: migrations, checks };
}

export function loadManifests({ manifestDir = path.join(process.cwd(), "ops", "data-releases"), repositoryRoot = process.cwd() } = {}) {
  if (!existsSync(manifestDir)) return [];
  const manifests = readdirSync(manifestDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const file = path.join(manifestDir, name);
      const raw = readFileSync(file);
      const manifest = validateManifest(JSON.parse(raw.toString("utf8")), { file, repositoryRoot });
      if (name !== `${manifest.id}.json`) fail(`${file} must be named ${manifest.id}.json`);
      return { ...manifest, file, manifestSha256: sha256(raw) };
    });
  const ids = new Set();
  for (const manifest of manifests) {
    if (ids.has(manifest.id)) fail(`duplicate data release id: ${manifest.id}`);
    ids.add(manifest.id);
  }
  return manifests;
}

export function validateReceipt(receipt, manifest, target) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) fail(`${manifest.id} receipt is missing`);
  if (receipt.schemaVersion !== 1 || receipt.kind !== RECEIPT_KIND) fail(`${manifest.id} receipt contract is invalid`);
  if (receipt.releaseId !== manifest.id) fail(`${manifest.id} receipt release id does not match`);
  if (receipt.manifestSha256 !== manifest.manifestSha256) fail(`${manifest.id} receipt belongs to another manifest revision`);
  if (receipt.target !== target) fail(`${manifest.id} receipt target is ${receipt.target ?? "missing"}, expected ${target}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(receipt.appliedAt ?? "")) fail(`${manifest.id} receipt appliedAt is invalid`);
  if (!Array.isArray(receipt.checks) || receipt.checks.length !== manifest.checks.length) fail(`${manifest.id} receipt checks are incomplete`);
  return receipt;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith("--")) fail(`unknown argument: ${argument}`);
    const value = rest[++index];
    if (value === undefined || value.startsWith("--")) fail(`missing value for ${argument}`);
    options[argument.slice(2).replaceAll("-", "_")] = value;
  }
  return { command, options };
}

function databaseUrl() {
  const value = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) fail("DIRECT_URL or DATABASE_URL must select PostgreSQL");
  return value;
}

function requireTarget(value) {
  if (!ALLOWED_TARGETS.has(value)) fail("--target must be local or production");
  return value;
}

async function readReceipt(client, releaseId) {
  const result = await client.query('SELECT "value" FROM "SystemConfig" WHERE "key" = $1', [`${RECEIPT_KEY_PREFIX}${releaseId}`]);
  if (result.rowCount === 0) return null;
  try {
    return JSON.parse(result.rows[0].value);
  } catch {
    fail(`${releaseId} receipt is not valid JSON`);
  }
}

async function runChecks(client, manifest) {
  const results = [];
  for (const check of manifest.checks) {
    const result = await client.query(check.sql);
    if (result.rowCount !== 1 || result.fields.length !== 1) fail(`${manifest.id}.${check.id} must return exactly one row and one column`);
    const actual = result.rows[0][result.fields[0].name];
    const normalized = actual === null || actual === undefined ? "" : String(actual);
    results.push({ id: check.id, expected: check.expected, actual: normalized, passed: normalized === check.expected });
  }
  return results;
}

async function inspectManifest(client, manifest, target) {
  await client.query("BEGIN READ ONLY");
  try {
    const [receipt, checks] = await Promise.all([readReceipt(client, manifest.id), runChecks(client, manifest)]);
    await client.query("COMMIT");
    let receiptError = null;
    if (receipt) {
      try { validateReceipt(receipt, manifest, target); } catch (error) { receiptError = error instanceof Error ? error.message : String(error); }
    }
    const checksPassed = checks.every((check) => check.passed);
    const sourceIncomplete = target === "production" && manifest.sourceCompleteness !== "complete";
    const state = sourceIncomplete ? "source_incomplete" : receiptError ? "receipt_mismatch" : receipt && checksPassed ? "applied" : checksPassed ? "ready_to_record" : "pending";
    return { id: manifest.id, title: manifest.title, manifestSha256: manifest.manifestSha256, state, receiptError, checks };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function recordManifest(client, manifest, target) {
  if (target === "production" && manifest.sourceCompleteness !== "complete") {
    fail(`${manifest.id} cannot be recorded in production until every canonical source is retained and hashed`);
  }
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`workspace-data-release:${manifest.id}`]);
    const checks = await runChecks(client, manifest);
    const failedChecks = checks.filter((check) => !check.passed);
    if (failedChecks.length > 0) fail(`${manifest.id} cannot be recorded; failed checks: ${failedChecks.map((check) => check.id).join(", ")}`);
    const receipt = {
      schemaVersion: 1,
      kind: RECEIPT_KIND,
      releaseId: manifest.id,
      manifestSha256: manifest.manifestSha256,
      target,
      appliedAt: new Date().toISOString(),
      sourceCommit: process.env.WORKSPACE_DATA_RELEASE_SOURCE_SHA || null,
      checks: checks.map(({ id, actual }) => ({ id, actual })),
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
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArguments(argv);
  const repositoryRoot = path.resolve(options.repository_root || process.cwd());
  const manifestDir = path.resolve(options.manifest_dir || path.join(repositoryRoot, "ops", "data-releases"));
  const manifests = loadManifests({ manifestDir, repositoryRoot });

  if (command === "check") {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, manifests: manifests.map(({ id, title, manifestSha256 }) => ({ id, title, manifestSha256 })) }, null, 2)}\n`);
    return;
  }

  const target = requireTarget(options.target);
  if (manifests.length === 0 && (command === "status" || command === "gate")) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, target, statuses: [], pending: [] }, null, 2)}\n`);
    return;
  }
  if (manifests.length === 0) fail("no source-controlled data releases exist; executable manifests must be private uploaded schemaVersion 2 bundles");
  const client = new Client({ connectionString: databaseUrl(), application_name: `workspace-data-release-${command}` });
  await client.connect();
  try {
    if (command === "status" || command === "gate") {
      const statuses = [];
      for (const manifest of manifests) statuses.push(await inspectManifest(client, manifest, target));
      const pending = statuses.filter((status) => status.state !== "applied");
      process.stdout.write(`${JSON.stringify({ schemaVersion: 1, target, statuses, pending: pending.map(({ id, state }) => ({ id, state })) }, null, 2)}\n`);
      if (command === "gate" && pending.length > 0) {
        fail(`data release gate blocked ${target}: ${pending.map(({ id, state }) => `${id} (${state})`).join(", ")}`);
      }
      return;
    }

    if (command === "record") {
      const id = requireString(options.id, "--id");
      const manifest = manifests.find((item) => item.id === id);
      if (!manifest) fail(`unknown data release: ${id}`);
      const receipt = await recordManifest(client, manifest, target);
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      return;
    }

    fail("usage: data-release.mjs check | status|gate --target local|production | record --target local|production --id ID");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
