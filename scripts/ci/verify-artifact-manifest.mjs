#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const TREE_PATTERN = /^[0-9a-f]{40}$/;

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function filesRecursively(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(child) : entry.isFile() ? [child] : [];
  });
}

export function migrationSetSha256(repositoryRoot) {
  const hash = createHash("sha256");
  for (const file of filesRecursively(path.join(repositoryRoot, "prisma", "migrations")).sort()) {
    hash.update(path.relative(repositoryRoot, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function record(value, location) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${location} must be an object`);
  return value;
}

function digest(value, location) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) throw new Error(`${location} must be lowercase SHA-256`);
  return value;
}

export function verifyArtifactManifest({
  repositoryRoot,
  artifactPath,
  manifestPath,
  expectedTreeId,
  expectedContentDigest,
  expectedEventName,
  expectedRunId,
  expectedRunAttempt,
}) {
  if (!TREE_PATTERN.test(expectedTreeId ?? "")) throw new Error("expected tree must be a full lowercase Git tree id");
  digest(expectedContentDigest, "expected content digest");
  if (fs.existsSync(path.join(repositoryRoot, "npm-shrinkwrap.json"))) {
    throw new Error("npm-shrinkwrap.json is forbidden; package-lock.json is the canonical npm ci input");
  }
  const manifest = record(JSON.parse(fs.readFileSync(manifestPath, "utf8")), "manifest");
  if (manifest.schemaVersion !== 2) throw new Error("manifest.schemaVersion must be 2");
  const source = record(manifest.source, "manifest.source");
  const inputs = record(manifest.inputs, "manifest.inputs");
  const artifact = record(manifest.artifact, "manifest.artifact");
  const build = record(manifest.build, "manifest.build");
  if (source.treeSha !== expectedTreeId || source.contentDigest !== expectedContentDigest) {
    throw new Error("manifest candidate content does not match expected content");
  }
  if (build.buildId !== expectedContentDigest) throw new Error("manifest buildId must equal candidate content digest");
  if (artifact.fileName !== path.basename(artifactPath)) throw new Error("manifest artifact filename does not match artifact path");
  const artifactDigest = sha256File(artifactPath);
  if (digest(artifact.sha256, "manifest.artifact.sha256") !== artifactDigest) {
    throw new Error("standalone artifact SHA-256 does not match manifest");
  }
  if (artifact.sizeBytes !== fs.statSync(artifactPath).size) throw new Error("standalone artifact size does not match manifest");
  if (digest(inputs.packageLockSha256, "manifest.inputs.packageLockSha256")
    !== sha256File(path.join(repositoryRoot, "package-lock.json"))) {
    throw new Error("package-lock SHA-256 does not match manifest");
  }
  if (digest(inputs.migrationSetSha256, "manifest.inputs.migrationSetSha256") !== migrationSetSha256(repositoryRoot)) {
    throw new Error("migration-set SHA-256 does not match manifest");
  }
  if (expectedEventName && build.githubEventName !== expectedEventName) throw new Error("manifest event does not match");
  if (expectedRunId && String(build.githubRunId) !== String(expectedRunId)) throw new Error("manifest run id does not match");
  if (expectedRunAttempt && String(build.githubRunAttempt) !== String(expectedRunAttempt)) throw new Error("manifest run attempt does not match");
  return {
    sourceTreeId: source.treeSha,
    contentDigest: source.contentDigest,
    artifactSha256: artifactDigest,
    artifactSizeBytes: artifact.sizeBytes,
  };
}

function parseArguments(argv) {
  const options = { repositoryRoot: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--repo") options.repositoryRoot = argv[++index];
    else if (argument === "--artifact") options.artifactPath = argv[++index];
    else if (argument === "--manifest") options.manifestPath = argv[++index];
    else if (argument === "--expected-tree") options.expectedTreeId = argv[++index];
    else if (argument === "--expected-content") options.expectedContentDigest = argv[++index];
    else if (argument === "--expected-event") options.expectedEventName = argv[++index];
    else if (argument === "--expected-run-id") options.expectedRunId = argv[++index];
    else if (argument === "--expected-run-attempt") options.expectedRunAttempt = argv[++index];
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!options.artifactPath || !options.manifestPath || !options.expectedTreeId || !options.expectedContentDigest) {
    throw new Error("--artifact, --manifest, --expected-tree, and --expected-content are required");
  }
  options.repositoryRoot = path.resolve(options.repositoryRoot);
  options.artifactPath = path.resolve(options.artifactPath);
  options.manifestPath = path.resolve(options.manifestPath);
  return options;
}

export function main(argv = process.argv.slice(2)) {
  process.stdout.write(`${JSON.stringify(verifyArtifactManifest(parseArguments(argv)))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
