#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const RELEASE_ID_PATTERN = /^[0-9]{14}-[0-9a-f]{8}$/;
const BUILD_SN_PATTERN = /^cnb-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LEGACY_RUNTIME_VERSION_PATTERN = /^local-[0-9]{8,}$/;
const CNB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MIGRATION_PATH_PATTERN = /^prisma\/migrations\/([0-9]{14}_[a-z0-9_]+)\/migration\.sql$/;

function fail(message) {
  throw new Error(message);
}

function git(cwd, args, { encoding = "utf8" } = {}) {
  const result = spawnSync("git", args, { cwd, encoding });
  if (result.status !== 0) {
    fail(`git ${args.join(" ")} failed${result.stderr?.toString().trim() ? `: ${result.stderr.toString().trim()}` : ""}`);
  }
  return result.stdout;
}

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) fail(`${label} must be a full lowercase Git SHA`);
  return value;
}

function migrationEntries(cwd, commit) {
  const paths = git(cwd, ["ls-tree", "-r", "--name-only", commit, "--", "prisma/migrations"])
    .trim()
    .split("\n")
    .filter(Boolean);
  const entries = [];
  for (const filePath of paths) {
    const match = filePath.match(MIGRATION_PATH_PATTERN);
    if (!match) continue;
    const bytes = git(cwd, ["show", `${commit}:${filePath}`], { encoding: null });
    entries.push({
      name: match[1],
      checksum: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(entries.map((entry) => entry.name)).size !== entries.length) {
    fail("baseline contains duplicate migration names");
  }
  return entries;
}

function migrationSetDigest(entries) {
  const canonical = entries.map((entry) => `${entry.name}\t${entry.checksum}\n`).join("");
  return createHash("sha256").update(canonical).digest("hex");
}

export function validateBootstrapContext(context) {
  if (!context || context.schemaVersion !== 1) fail("production bootstrap context schemaVersion must be 1");
  requireSha(context.baselineSha, "production bootstrap baseline");
  const legacy = context.legacy;
  if (!legacy) fail("production bootstrap legacy identity is missing");
  requireSha(legacy.cnbCommitSha, "legacy CNB commit");
  if (!RELEASE_ID_PATTERN.test(legacy.releaseId ?? "")) fail("legacy release id is invalid");
  if (!BUILD_SN_PATTERN.test(legacy.cnbBuildSn ?? "")) fail("legacy CNB build SN is invalid");
  if (!LEGACY_RUNTIME_VERSION_PATTERN.test(legacy.runtimeVersion ?? "")) {
    fail("legacy runtime version is invalid");
  }
  if (!LEGACY_RUNTIME_VERSION_PATTERN.test(legacy.buildId ?? "")) {
    fail("legacy filesystem BUILD_ID is invalid");
  }
  if (!CNB_REPOSITORY_PATTERN.test(legacy.cnbRepository ?? "")) {
    fail("legacy CNB repository is invalid");
  }
  if (!Number.isInteger(context.database?.migrationCount) || context.database.migrationCount < 1) {
    fail("production bootstrap migration count is invalid");
  }
  if (!DIGEST_PATTERN.test(context.database?.migrationSetSha256 ?? "")) {
    fail("production bootstrap migration-set digest is invalid");
  }
  if (!legacy.releaseId.endsWith(`-${legacy.cnbCommitSha.slice(0, 8)}`)) {
    fail("legacy release id does not bind the legacy CNB commit");
  }
  return context;
}

export function createBootstrapContext({
  cwd,
  baselineSha,
  candidateSha,
  legacyCnbCommitSha,
  legacyReleaseId,
  legacyCnbBuildSn,
  legacyRuntimeVersion,
  legacyBuildId,
  legacyCnbRepository,
}) {
  requireSha(baselineSha, "production bootstrap baseline");
  requireSha(candidateSha, "candidate");
  requireSha(legacyCnbCommitSha, "legacy CNB commit");
  git(cwd, ["cat-file", "-e", `${baselineSha}^{commit}`]);
  git(cwd, ["cat-file", "-e", `${candidateSha}^{commit}`]);
  git(cwd, ["cat-file", "-e", `${legacyCnbCommitSha}^{commit}`]);
  if (spawnSync("git", ["merge-base", "--is-ancestor", baselineSha, candidateSha], { cwd }).status !== 0) {
    fail(`bootstrap baseline ${baselineSha} is not an ancestor of candidate ${candidateSha}`);
  }
  const legacyParents = git(cwd, ["rev-list", "--parents", "-n", "1", legacyCnbCommitSha]).trim().split(/\s+/);
  if (legacyParents.length !== 2 || legacyParents[1] !== baselineSha) {
    fail("legacy CNB injection commit must have the bootstrap baseline as its only parent");
  }
  const legacyFiles = git(cwd, ["diff-tree", "--no-commit-id", "--name-only", "-r", legacyCnbCommitSha])
    .trim()
    .split("\n")
    .filter(Boolean);
  if (legacyFiles.length !== 1 || legacyFiles[0] !== ".cnb.yml") {
    fail("legacy CNB injection commit must change only .cnb.yml");
  }
  const entries = migrationEntries(cwd, baselineSha);
  return validateBootstrapContext({
    schemaVersion: 1,
    baselineSha,
    legacy: {
      cnbCommitSha: legacyCnbCommitSha,
      releaseId: legacyReleaseId,
      cnbBuildSn: legacyCnbBuildSn,
      runtimeVersion: legacyRuntimeVersion,
      buildId: legacyBuildId,
      cnbRepository: legacyCnbRepository,
    },
    database: {
      migrationCount: entries.length,
      migrationSetSha256: migrationSetDigest(entries),
    },
  });
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) fail(`unknown argument: ${key ?? "<empty>"}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) fail(`missing value for ${key}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function required(options, key) {
  if (!options[key]) fail(`--${key.replaceAll("_", "-")} is required`);
  return options[key];
}

export function verifyBootstrapContext({ cwd, candidateSha, context }) {
  const validated = validateBootstrapContext(context);
  const recomputed = createBootstrapContext({
    cwd,
    baselineSha: validated.baselineSha,
    candidateSha,
    legacyCnbCommitSha: validated.legacy.cnbCommitSha,
    legacyReleaseId: validated.legacy.releaseId,
    legacyCnbBuildSn: validated.legacy.cnbBuildSn,
    legacyRuntimeVersion: validated.legacy.runtimeVersion,
    legacyBuildId: validated.legacy.buildId,
    legacyCnbRepository: validated.legacy.cnbRepository,
  });
  if (JSON.stringify(recomputed) !== JSON.stringify(validated)) {
    fail("production bootstrap context does not match immutable Git history");
  }
  return validated;
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  const cwd = path.resolve(options.cwd ?? process.cwd());
  if (command === "create") {
    const context = createBootstrapContext({
      cwd,
      baselineSha: required(options, "baseline"),
      candidateSha: required(options, "candidate"),
      legacyCnbCommitSha: required(options, "legacy_cnb_commit"),
      legacyReleaseId: required(options, "legacy_release_id"),
      legacyCnbBuildSn: required(options, "legacy_cnb_build_sn"),
      legacyRuntimeVersion: required(options, "legacy_runtime_version"),
      legacyBuildId: required(options, "legacy_build_id"),
      legacyCnbRepository: required(options, "legacy_cnb_repository"),
    });
    const output = path.resolve(required(options, "output"));
    const temporary = `${output}.tmp-${process.pid}`;
    writeFileSync(temporary, `${JSON.stringify(context, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, output);
    return;
  }
  if (command === "verify") {
    const context = JSON.parse(readFileSync(path.resolve(required(options, "context")), "utf8"));
    verifyBootstrapContext({
      cwd,
      candidateSha: required(options, "candidate"),
      context,
    });
    process.stdout.write(`${JSON.stringify(context)}\n`);
    return;
  }
  fail("usage: production-bootstrap-receipt.mjs create|verify [options]");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
