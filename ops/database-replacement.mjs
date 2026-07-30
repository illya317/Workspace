#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { migrationSetSha256 } from "../scripts/ci/verify-artifact-manifest.mjs";

const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ARTIFACT_PATTERN = /^[0-9a-f]{40}\/[0-9a-f]{64}\/workspace-postgresql\.dump$/;

function fail(message) {
  throw new Error(message);
}

function requireGitSha(value, label) {
  if (!GIT_SHA_PATTERN.test(value ?? "")) fail(`${label} must be a full lowercase Git SHA`);
  return value;
}

function requireDigest(value, label) {
  if (!SHA256_PATTERN.test(value ?? "")) fail(`${label} must be a lowercase SHA-256`);
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive integer`);
  return value;
}

function requireTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("preparedAt must be an ISO timestamp");
  return value;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function migrationCount(repositoryRoot) {
  const migrationsRoot = path.join(repositoryRoot, "prisma", "migrations");
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[0-9]{14}_[a-z0-9_]+$/.test(entry.name))
    .length;
}

export function createDatabaseReplacementReceipt({
  sourceSha,
  treeSha,
  dumpFile,
  repositoryRoot,
  preparedAt = new Date().toISOString(),
} = {}) {
  const canonicalSourceSha = requireGitSha(sourceSha, "source SHA");
  const canonicalTreeSha = requireGitSha(treeSha, "tree SHA");
  const resolvedDump = path.resolve(dumpFile ?? "");
  const stat = statSync(resolvedDump);
  if (!stat.isFile() || stat.size < 1) fail("database replacement dump must be a non-empty regular file");
  const dumpSha256 = sha256File(resolvedDump);
  const root = path.resolve(repositoryRoot ?? process.cwd());
  const migrations = migrationCount(root);
  if (migrations < 1) fail("database replacement source has no Prisma migrations");
  return {
    schemaVersion: 1,
    kind: "workspace-database-replacement",
    status: "prepared",
    source: { commitSha: canonicalSourceSha, treeSha: canonicalTreeSha },
    dump: {
      format: "postgresql-custom",
      sha256: dumpSha256,
      sizeBytes: stat.size,
      remoteArtifact: `${canonicalSourceSha}/${dumpSha256}/workspace-postgresql.dump`,
    },
    database: {
      migrationCount: migrations,
      migrationSetSha256: migrationSetSha256(root),
    },
    preparedAt: requireTimestamp(preparedAt),
  };
}

export function validateDatabaseReplacementReceipt(receipt, { sourceSha, treeSha } = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) fail("database replacement receipt must be an object");
  const keys = Object.keys(receipt).sort().join(",");
  if (keys !== "database,dump,kind,preparedAt,schemaVersion,source,status"
    || receipt.schemaVersion !== 1
    || receipt.kind !== "workspace-database-replacement"
    || receipt.status !== "prepared") {
    fail("database replacement receipt contract is invalid");
  }
  if (Object.keys(receipt.source ?? {}).sort().join(",") !== "commitSha,treeSha"
    || receipt.source.commitSha !== requireGitSha(sourceSha, "source SHA")
    || receipt.source.treeSha !== requireGitSha(treeSha, "tree SHA")) {
    fail("database replacement receipt belongs to a different source tree");
  }
  if (Object.keys(receipt.dump ?? {}).sort().join(",") !== "format,remoteArtifact,sha256,sizeBytes"
    || receipt.dump.format !== "postgresql-custom"
    || !ARTIFACT_PATTERN.test(receipt.dump.remoteArtifact ?? "")
    || receipt.dump.remoteArtifact !== `${receipt.source.commitSha}/${requireDigest(receipt.dump.sha256, "dump SHA-256")}/workspace-postgresql.dump`
    || !Number.isSafeInteger(receipt.dump.sizeBytes)
    || receipt.dump.sizeBytes < 1) {
    fail("database replacement dump descriptor is invalid");
  }
  if (Object.keys(receipt.database ?? {}).sort().join(",") !== "migrationCount,migrationSetSha256") {
    fail("database replacement migration descriptor is invalid");
  }
  requirePositiveInteger(receipt.database.migrationCount, "migration count");
  requireDigest(receipt.database.migrationSetSha256, "migration-set SHA-256");
  requireTimestamp(receipt.preparedAt);
  return receipt;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) fail(`invalid argument: ${key ?? "<missing>"}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function required(options, name) {
  if (!options[name]) fail(`--${name.replaceAll("_", "-")} is required`);
  return options[name];
}

function atomicWriteJson(file, value) {
  const target = path.resolve(file);
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${process.pid}`);
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.command === "create") {
    const receipt = createDatabaseReplacementReceipt({
      sourceSha: required(options, "source"),
      treeSha: required(options, "tree"),
      dumpFile: required(options, "dump"),
      repositoryRoot: required(options, "repository_root"),
    });
    atomicWriteJson(required(options, "output"), receipt);
    return receipt;
  }
  if (options.command === "verify") {
    const receipt = validateDatabaseReplacementReceipt(
      JSON.parse(readFileSync(required(options, "file"), "utf8")),
      { sourceSha: required(options, "source"), treeSha: required(options, "tree") },
    );
    if (options.dump) {
      const stat = statSync(path.resolve(options.dump));
      if (!stat.isFile() || stat.size !== receipt.dump.sizeBytes || sha256File(options.dump) !== receipt.dump.sha256) {
        fail("database replacement dump differs from its receipt");
      }
    }
    return receipt;
  }
  fail("command must be create or verify");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
