#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function filesRecursively(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesRecursively(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

export function migrationSetSha256(repositoryRoot) {
  const migrationRoot = path.join(repositoryRoot, "prisma", "migrations");
  const hash = createHash("sha256");
  for (const filePath of filesRecursively(migrationRoot).sort()) {
    hash.update(path.relative(repositoryRoot, filePath).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function requireRecord(value, location) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${location} must be an object`);
  return value;
}

function requireDigest(value, location) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new Error(`${location} must be lowercase SHA-256`);
  return value;
}

function requireStringArray(value, location) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${location} must be a string array`);
  }
  const normalized = [...new Set(value)].sort();
  if (JSON.stringify(value) !== JSON.stringify(normalized)) {
    throw new Error(`${location} must be sorted and unique`);
  }
  return value;
}

export function verifyArtifactManifest({
  repositoryRoot,
  artifactPath,
  manifestPath,
  expectedCommitSha,
  expectedTreeSha,
  expectedEventName,
  expectedRunId,
  expectedRunAttempt,
  requireFullDispatch = false,
}) {
  if (!GIT_SHA_PATTERN.test(expectedCommitSha)) throw new Error("expected commit must be a full lowercase Git SHA");
  if (fs.existsSync(path.join(repositoryRoot, "npm-shrinkwrap.json"))) {
    throw new Error("npm-shrinkwrap.json is forbidden; package-lock.json is the canonical npm ci input");
  }
  const manifest = requireRecord(JSON.parse(fs.readFileSync(manifestPath, "utf8")), "manifest");
  if (manifest.schemaVersion !== 1) throw new Error("manifest.schemaVersion must be 1");
  const source = requireRecord(manifest.source, "manifest.source");
  const inputs = requireRecord(manifest.inputs, "manifest.inputs");
  const artifact = requireRecord(manifest.artifact, "manifest.artifact");
  const build = requireRecord(manifest.build, "manifest.build");

  if (source.commitSha !== expectedCommitSha) {
    throw new Error(`manifest source commit ${String(source.commitSha)} does not match ${expectedCommitSha}`);
  }
  if (!GIT_SHA_PATTERN.test(source.treeSha)) throw new Error("manifest.source.treeSha must be a full lowercase Git tree SHA");
  if (expectedTreeSha && source.treeSha !== expectedTreeSha) {
    throw new Error(`manifest source tree ${source.treeSha} does not match ${expectedTreeSha}`);
  }
  if (artifact.fileName !== path.basename(artifactPath)) throw new Error("manifest artifact filename does not match artifact path");
  const actualArtifactDigest = sha256File(artifactPath);
  if (requireDigest(artifact.sha256, "manifest.artifact.sha256") !== actualArtifactDigest) {
    throw new Error("standalone artifact SHA-256 does not match manifest");
  }
  if (artifact.sizeBytes !== fs.statSync(artifactPath).size) throw new Error("standalone artifact size does not match manifest");
  const packageLockDigest = sha256File(path.join(repositoryRoot, "package-lock.json"));
  if (requireDigest(inputs.packageLockSha256, "manifest.inputs.packageLockSha256") !== packageLockDigest) {
    throw new Error("package-lock SHA-256 does not match manifest");
  }
  const migrationsDigest = migrationSetSha256(repositoryRoot);
  if (requireDigest(inputs.migrationSetSha256, "manifest.inputs.migrationSetSha256") !== migrationsDigest) {
    throw new Error("migration-set SHA-256 does not match manifest");
  }
  if (expectedEventName && build.githubEventName !== expectedEventName) {
    throw new Error(`manifest event ${String(build.githubEventName)} does not match ${expectedEventName}`);
  }
  if (expectedRunId && String(build.githubRunId) !== String(expectedRunId)) {
    throw new Error(`manifest run id ${String(build.githubRunId)} does not match ${expectedRunId}`);
  }
  if (expectedRunAttempt && String(build.githubRunAttempt) !== String(expectedRunAttempt)) {
    throw new Error(`manifest run attempt ${String(build.githubRunAttempt)} does not match ${expectedRunAttempt}`);
  }
  if (build.targetSha !== expectedCommitSha) throw new Error("manifest build.targetSha does not match source commit");
  const classification = requireRecord(build.classification, "manifest.build.classification");
  if (classification.schemaVersion !== 1) throw new Error("manifest build classification schemaVersion must be 1");
  const requiredSuites = requireStringArray(build.requiredSuites, "manifest.build.requiredSuites");
  const e2eSpecs = requireStringArray(build.e2eSpecs, "manifest.build.e2eSpecs");
  if (
    classification.riskClass !== build.riskClass
    || classification.e2eMode !== build.e2eMode
    || JSON.stringify(classification.requiredSuites) !== JSON.stringify(requiredSuites)
    || JSON.stringify(classification.e2eSpecs) !== JSON.stringify(e2eSpecs)
  ) {
    throw new Error("manifest build classification fields are inconsistent");
  }
  if (requireFullDispatch) {
    if (build.githubEventName !== "workflow_dispatch") throw new Error("full dispatch evidence must come from workflow_dispatch");
    if (build.riskClass !== "C3" || build.e2eMode !== "full" || build.forceFull !== true) {
      throw new Error("workflow_dispatch artifact must prove C3/full/forceFull=true");
    }
  }
  return {
    sourceCommitSha: source.commitSha,
    sourceTreeSha: source.treeSha,
    artifactSha256: actualArtifactDigest,
    artifactSizeBytes: artifact.sizeBytes,
    riskClass: build.riskClass,
    e2eMode: build.e2eMode,
    forceFull: build.forceFull,
    targetSha: build.targetSha,
    requiredSuites,
    e2eSpecs,
  };
}

function parseArguments(argv) {
  const options = { repositoryRoot: process.cwd(), requireFullDispatch: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--repo") options.repositoryRoot = argv[++index];
    else if (argument === "--artifact") options.artifactPath = argv[++index];
    else if (argument === "--manifest") options.manifestPath = argv[++index];
    else if (argument === "--expected-sha") options.expectedCommitSha = argv[++index];
    else if (argument === "--expected-tree") options.expectedTreeSha = argv[++index];
    else if (argument === "--expected-event") options.expectedEventName = argv[++index];
    else if (argument === "--expected-run-id") options.expectedRunId = argv[++index];
    else if (argument === "--expected-run-attempt") options.expectedRunAttempt = argv[++index];
    else if (argument === "--require-full-dispatch") options.requireFullDispatch = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!options.artifactPath || !options.manifestPath || !options.expectedCommitSha || !options.expectedTreeSha) {
    throw new Error("--artifact, --manifest, --expected-sha, and --expected-tree are required");
  }
  if (!GIT_SHA_PATTERN.test(options.expectedTreeSha)) throw new Error("--expected-tree must be a full lowercase Git SHA");
  options.repositoryRoot = path.resolve(options.repositoryRoot);
  options.artifactPath = path.resolve(options.artifactPath);
  options.manifestPath = path.resolve(options.manifestPath);
  return options;
}

export function main(argv = process.argv.slice(2)) {
  const result = verifyArtifactManifest(parseArguments(argv));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
