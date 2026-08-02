#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  digestFile,
  digestLifecycleSourceToolSet,
} from "./control-plane-receipt.mjs";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const KIND = "workspace-control-plane-requirements";

function fail(message) {
  throw new Error(message);
}

function requireDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) fail(`${label} must be a full lowercase Git SHA`);
  return value;
}

export function digestMigrationSet(repositoryRoot) {
  const migrationRoot = path.join(repositoryRoot, "prisma", "migrations");
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  visit(migrationRoot);
  if (files.length === 0) fail(`migration set is empty: ${migrationRoot}`);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(path.relative(repositoryRoot, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function createControlPlaneRequirements({
  repositoryRoot,
  resourceManifestFile,
  sourceSha,
  sourceTree,
  createdAt = new Date().toISOString(),
}) {
  return normalizeControlPlaneRequirements({
    schemaVersion: 1,
    kind: KIND,
    source: {
      commitSha: sourceSha,
      treeSha: sourceTree,
    },
    inputs: {
      migrationSetSha256: digestMigrationSet(repositoryRoot),
      resourceManifestSha256: digestFile(resourceManifestFile),
      lifecycleToolSetSha256: digestLifecycleSourceToolSet(repositoryRoot),
    },
    createdAt,
  });
}

export function normalizeControlPlaneRequirements(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schemaVersion !== 1 || value.kind !== KIND) {
    fail("control-plane requirements contract is invalid");
  }
  requireSha(value.source?.commitSha, "requirements source SHA");
  requireSha(value.source?.treeSha, "requirements source tree");
  for (const [key, digest] of Object.entries(value.inputs ?? {})) requireDigest(digest, `requirements ${key}`);
  const exactKeys = [
    "lifecycleToolSetSha256",
    "migrationSetSha256",
    "resourceManifestSha256",
  ];
  if (JSON.stringify(Object.keys(value.inputs ?? {}).sort()) !== JSON.stringify(exactKeys)) {
    fail("control-plane requirements inputs are incomplete or unknown");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.createdAt ?? "")) {
    fail("control-plane requirements creation time is invalid");
  }
  return value;
}

export function readControlPlaneRequirements(file) {
  return normalizeControlPlaneRequirements(JSON.parse(readFileSync(file, "utf8")));
}

export function writeControlPlaneRequirements(file, requirements) {
  const normalized = normalizeControlPlaneRequirements(requirements);
  const resolved = path.resolve(file);
  mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(resolved), `.${path.basename(resolved)}.tmp-${process.pid}-${randomUUID()}`);
  writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, resolved);
  chmodSync(resolved, 0o600);
  return normalized;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) fail(`invalid argument: ${key ?? "<missing>"}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function required(options, key) {
  const value = options[key];
  if (!value) fail(`--${key.replaceAll("_", "-")} is required`);
  return value;
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  if (command !== "write") fail(`unknown command: ${command ?? "<missing>"}`);
  const requirements = createControlPlaneRequirements({
    repositoryRoot: path.resolve(required(options, "repository_root")),
    resourceManifestFile: path.resolve(required(options, "resource_manifest")),
    sourceSha: required(options, "source_sha"),
    sourceTree: required(options, "source_tree"),
  });
  writeControlPlaneRequirements(required(options, "output"), requirements);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
