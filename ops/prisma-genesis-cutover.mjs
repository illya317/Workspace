#!/usr/bin/env node

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import pg from "pg";

const { Client } = pg;
const MARKER_KEY = "database.prisma.genesis";
const MARKER_KIND = "workspace-prisma-genesis";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const MIGRATION_PATTERN = /^[0-9]{14}_[a-z0-9_]+$/;

function fail(message) {
  throw new Error(message);
}

function requirePattern(value, pattern, label) {
  if (!pattern.test(value ?? "")) fail(`${label} is invalid`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedMigrationRows(rows) {
  const active = [];
  const names = new Set();
  for (const row of rows) {
    const name = requirePattern(row.migration_name, MIGRATION_PATTERN, "database migration name");
    const checksum = requirePattern(row.checksum, DIGEST_PATTERN, `${name} checksum`);
    if (names.has(name)) fail(`database migration history repeats ${name}`);
    names.add(name);
    const appliedStepsCount = Number(row.applied_steps_count);
    if (
      row.finished_at == null
      || row.rolled_back_at != null
      || !Number.isSafeInteger(appliedStepsCount)
      || appliedStepsCount < 0
    ) {
      fail(`database migration ${name} is not one successful active receipt`);
    }
    active.push({ name, checksum, appliedStepsCount });
  }
  return active.sort((left, right) => left.name.localeCompare(right.name));
}

export function digestMigrationRows(rows) {
  const active = normalizedMigrationRows(rows);
  if (active.some((row) => row.appliedStepsCount < 1)) {
    fail("legacy migration inventory contains a receipt that was only resolved, not executed");
  }
  return sha256(active.map((row) => `${row.name}\t${row.checksum}\n`).join(""));
}

function markerIdentity(options) {
  return {
    schemaVersion: 1,
    kind: MARKER_KIND,
    fromSourceSha: requirePattern(options.fromSourceSha, SHA_PATTERN, "genesis source baseline"),
    candidateSourceSha: requirePattern(options.candidateSourceSha, SHA_PATTERN, "genesis candidate source"),
    legacyMigrationCount: options.legacyMigrationCount,
    legacyMigrationSetSha256: requirePattern(options.legacyMigrationSetSha256, DIGEST_PATTERN, "legacy migration-set digest"),
    baselineMigration: requirePattern(options.baselineMigration, MIGRATION_PATTERN, "sanitized baseline migration"),
    baselineChecksum: requirePattern(options.baselineChecksum, DIGEST_PATTERN, "sanitized baseline checksum"),
  };
}

function readMarker(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    fail("Prisma genesis marker is invalid JSON");
  }
}

function requireMatchingMarker(marker, identity) {
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) fail("Prisma genesis marker is missing");
  for (const [key, expected] of Object.entries(identity)) {
    if (marker[key] !== expected) fail(`Prisma genesis marker ${key} does not match the release`);
  }
  if (!["cleared", "completed"].includes(marker.status)) fail("Prisma genesis marker status is invalid");
  return marker;
}

function isCompletedSourceReanchor(marker, identity) {
  return marker?.schemaVersion === 1
    && marker.kind === MARKER_KIND
    && marker.status === "completed"
    && marker.candidateSourceSha === identity.fromSourceSha
    && marker.baselineMigration === identity.baselineMigration
    && marker.baselineChecksum === identity.baselineChecksum;
}

export function classifyGenesisState({ rows, marker, ...options }) {
  const identity = markerIdentity(options);
  const active = normalizedMigrationRows(rows);
  const baselineRows = active.filter((row) => row.name === identity.baselineMigration);
  if (baselineRows.length > 0) {
    if (active.length !== 1 || baselineRows[0].checksum !== identity.baselineChecksum) {
      fail("sanitized baseline receipt is mixed with unexpected migration history or has a checksum mismatch");
    }
    if (baselineRows[0].appliedStepsCount !== 0) {
      fail("sanitized baseline receipt must be recorded by Prisma resolve without executing baseline SQL");
    }
    if (isCompletedSourceReanchor(marker, identity)) {
      return { state: "completed", identity, marker, sourceReanchor: true };
    }
    const checkedMarker = requireMatchingMarker(marker, identity);
    return { state: checkedMarker.status === "completed" ? "completed" : "baseline-recorded", identity, marker: checkedMarker };
  }
  if (active.length === 0) {
    const checkedMarker = requireMatchingMarker(marker, identity);
    if (checkedMarker.status !== "cleared") fail("completed Prisma genesis marker cannot have an empty migration table");
    return { state: "cleared", identity, marker: checkedMarker };
  }
  if (active.length !== identity.legacyMigrationCount) {
    fail(`legacy migration count is ${active.length}, expected ${identity.legacyMigrationCount}`);
  }
  if (active.some((row) => row.appliedStepsCount < 1)) {
    fail("legacy migration inventory contains a receipt that was only resolved, not executed");
  }
  const actualDigest = sha256(active.map((row) => `${row.name}\t${row.checksum}\n`).join(""));
  if (actualDigest !== identity.legacyMigrationSetSha256) {
    fail(`legacy migration-set digest is ${actualDigest}, expected ${identity.legacyMigrationSetSha256}`);
  }
  if (marker) fail("Prisma genesis marker exists before the audited legacy inventory was cleared");
  return { state: "legacy-ready", identity, marker: null };
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

function runtimeOptions(options) {
  const count = Number(required(options, "legacy_migration_count"));
  if (!Number.isSafeInteger(count) || count < 1) fail("legacy migration count must be a positive integer");
  return {
    databaseUrl: required(options, "database_url"),
    fromSourceSha: required(options, "from_source_sha"),
    candidateSourceSha: required(options, "candidate_source_sha"),
    legacyMigrationCount: count,
    legacyMigrationSetSha256: required(options, "legacy_migration_set_sha256"),
    baselineMigration: required(options, "baseline_migration"),
    baselineChecksum: required(options, "baseline_checksum"),
  };
}

async function readState(client, options, { lock = false } = {}) {
  if (lock) await client.query('LOCK TABLE "_prisma_migrations" IN ACCESS EXCLUSIVE MODE');
  const [migrations, markerResult] = await Promise.all([
    client.query('SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations" ORDER BY migration_name, id'),
    client.query('SELECT "value" FROM "SystemConfig" WHERE "key" = $1', [MARKER_KEY]),
  ]);
  return classifyGenesisState({ rows: migrations.rows, marker: readMarker(markerResult.rows[0]?.value), ...options });
}

async function writeMarker(client, value) {
  await client.query(
    'INSERT INTO "SystemConfig" ("key", "value") VALUES ($1, $2) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"',
    [MARKER_KEY, JSON.stringify(value)],
  );
}

async function run(command, options) {
  if (!/^postgres(?:ql)?:\/\//.test(options.databaseUrl)) fail("--database-url must select PostgreSQL");
  const client = new Client({ connectionString: options.databaseUrl, application_name: "workspace-prisma-genesis-cutover" });
  await client.connect();
  try {
    if (command === "status") return await readState(client, options);
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [MARKER_KEY]);
    const current = await readState(client, options, { lock: true });
    if (command === "prepare") {
      if (current.state === "legacy-ready") {
        const marker = { ...current.identity, status: "cleared", preparedAt: new Date().toISOString() };
        await writeMarker(client, marker);
        await client.query('DELETE FROM "_prisma_migrations"');
        await client.query("COMMIT");
        return { state: "cleared", marker };
      }
      await client.query("COMMIT");
      return current;
    }
    if (command === "finalize") {
      if (current.state === "cleared") fail("sanitized baseline has not been recorded by Prisma");
      if (current.state === "legacy-ready") fail("legacy migration history has not been cleared");
      if (current.state === "completed") {
        await client.query("COMMIT");
        return current;
      }
      const marker = { ...current.marker, status: "completed", completedAt: new Date().toISOString() };
      await writeMarker(client, marker);
      await client.query("COMMIT");
      return { state: "completed", marker };
    }
    fail(`unknown command: ${command ?? "<missing>"}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArguments(argv);
  if (!["status", "prepare", "finalize"].includes(command)) fail("command must be status, prepare, or finalize");
  const result = await run(command, runtimeOptions(options));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
