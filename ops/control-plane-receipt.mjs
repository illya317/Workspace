#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readTenantConfigManifest } from "./tenant-config-manifest.mjs";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const TARGETS = new Set(["production"]);
const KIND = "workspace-control-plane-release";
const AUTHORITY = "workspace-control-plane-job";
const REQUIRED_OPERATIONS = [
  "tenant-config-verified",
  "database-migrations",
  "resource-registry-seed",
  "agent-workforce-provision",
  "permission-action-grants",
  "database-runtime-parity",
];
const LIFECYCLE_TOOL_FILES = [
  "node_modules/prisma/package.json",
  "ops/prisma-genesis-cutover.mjs",
  "scripts/check/check-permission-action-grants.mjs",
  "scripts/check/check-prisma-deploy-status.js",
  "scripts/ci/check-migration-policy.mjs",
  "scripts/lib/agent-workforce-specs.mjs",
  "scripts/migrate/sqlite-to-postgresql.mjs",
  "scripts/provision-agent-workforce.mjs",
  "seed-resources-runtime.mjs",
];
const LIFECYCLE_SOURCE_TOOL_FILES = LIFECYCLE_TOOL_FILES.map((relativePath) => ({
  relativePath,
  sourcePath: relativePath === "seed-resources-runtime.mjs"
    ? "scripts/seed-resources-runtime.mjs"
    : relativePath,
}));

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireString(value, label) {
  if (typeof value !== "string" || !value) fail(`${label} is required`);
  return value;
}

function requireDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) fail(`${label} must be a full lowercase Git SHA`);
  return value;
}

function requireTarget(value) {
  if (!TARGETS.has(value)) fail("control-plane target must be production");
  return value;
}

function requireTimestamp(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value ?? "")) {
    fail(`${label} must be an ISO UTC timestamp`);
  }
  return value;
}

export function digestFile(file) {
  return sha256(readFileSync(file));
}

export function digestLifecycleToolSet(root) {
  const entries = LIFECYCLE_TOOL_FILES.map((relativePath) => ({
    relativePath,
    digest: digestFile(path.join(root, relativePath)),
  }));
  return sha256(Buffer.from(entries.map((entry) => `${entry.relativePath}\0${entry.digest}\n`).join("")));
}

export function digestLifecycleSourceToolSet(root) {
  const entries = LIFECYCLE_SOURCE_TOOL_FILES.map(({ relativePath, sourcePath }) => ({
    relativePath,
    digest: digestFile(path.join(root, sourcePath)),
  }));
  return sha256(Buffer.from(entries.map((entry) => `${entry.relativePath}\0${entry.digest}\n`).join("")));
}

function inputDigests({ migrationSetSha256, resourceManifestFile, tenantManifestFile, lifecycleRoot }) {
  const tenantManifest = readTenantConfigManifest(tenantManifestFile);
  return {
    migrationSetSha256: requireDigest(migrationSetSha256, "migration-set digest"),
    resourceManifestSha256: digestFile(resourceManifestFile),
    tenantConfigDigest: tenantManifest.digest,
    lifecycleToolSetSha256: digestLifecycleToolSet(lifecycleRoot),
  };
}

export function createControlPlaneReceipt({
  target,
  sourceSha,
  sourceTree,
  migrationSetSha256,
  resourceManifestFile,
  tenantManifestFile,
  lifecycleRoot,
  completedAt = new Date().toISOString(),
}) {
  const receipt = {
    schemaVersion: 1,
    kind: KIND,
    target: requireTarget(target),
    authority: AUTHORITY,
    source: {
      commitSha: requireSha(sourceSha, "control-plane source SHA"),
      treeSha: requireSha(sourceTree, "control-plane source tree"),
    },
    inputs: inputDigests({
      migrationSetSha256,
      resourceManifestFile,
      tenantManifestFile,
      lifecycleRoot,
    }),
    operations: REQUIRED_OPERATIONS.map((id) => ({ id, status: "passed" })),
    completedAt: requireTimestamp(completedAt, "control-plane completedAt"),
  };
  return normalizeControlPlaneReceipt(receipt);
}

export function normalizeControlPlaneReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) fail("control-plane receipt must be an object");
  if (receipt.schemaVersion !== 1 || receipt.kind !== KIND || receipt.authority !== AUTHORITY) {
    fail("control-plane receipt contract is invalid");
  }
  requireTarget(receipt.target);
  const source = {
    commitSha: requireSha(receipt.source?.commitSha, "control-plane source SHA"),
    treeSha: requireSha(receipt.source?.treeSha, "control-plane source tree"),
  };
  const inputs = {
    migrationSetSha256: requireDigest(receipt.inputs?.migrationSetSha256, "migration-set digest"),
    resourceManifestSha256: requireDigest(receipt.inputs?.resourceManifestSha256, "resource manifest digest"),
    tenantConfigDigest: requireDigest(receipt.inputs?.tenantConfigDigest, "tenant config digest"),
    lifecycleToolSetSha256: requireDigest(receipt.inputs?.lifecycleToolSetSha256, "lifecycle tool-set digest"),
  };
  if (!Array.isArray(receipt.operations) || receipt.operations.length !== REQUIRED_OPERATIONS.length) {
    fail("control-plane receipt operations are incomplete");
  }
  const operationIds = receipt.operations.map((operation) => operation?.id);
  if (JSON.stringify(operationIds) !== JSON.stringify(REQUIRED_OPERATIONS)
    || receipt.operations.some((operation) => operation.status !== "passed")) {
    fail("control-plane receipt operations must be the exact ordered passed set");
  }
  return {
    schemaVersion: 1,
    kind: KIND,
    target: receipt.target,
    authority: AUTHORITY,
    source,
    inputs,
    operations: REQUIRED_OPERATIONS.map((id) => ({ id, status: "passed" })),
    completedAt: requireTimestamp(receipt.completedAt, "control-plane completedAt"),
  };
}

export function readControlPlaneReceipt(file) {
  return normalizeControlPlaneReceipt(JSON.parse(readFileSync(file, "utf8")));
}

export function assertControlPlaneReceipt({
  file,
  target,
  migrationSetSha256,
  resourceManifestFile,
  tenantManifestFile,
  lifecycleRoot,
}) {
  const receipt = readControlPlaneReceipt(file);
  const expectedTarget = requireTarget(target);
  if (receipt.target !== expectedTarget) fail(`control-plane receipt target is ${receipt.target}, expected ${expectedTarget}`);
  const expectedInputs = inputDigests({
    migrationSetSha256,
    resourceManifestFile,
    tenantManifestFile,
    lifecycleRoot,
  });
  for (const [key, expected] of Object.entries(expectedInputs)) {
    if (receipt.inputs[key] !== expected) {
      fail(`control-plane receipt ${key} mismatch: expected ${expected}, received ${receipt.inputs[key]}`);
    }
  }
  return receipt;
}

export function writeControlPlaneReceipt(file, receipt) {
  const normalized = normalizeControlPlaneReceipt(receipt);
  const resolved = path.resolve(file);
  const temporary = path.resolve(path.dirname(resolved), `.${path.basename(resolved)}.tmp-${process.pid}-${randomUUID()}`);
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
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      fail(`invalid argument: ${key ?? "<missing>"}`);
    }
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function requiredOption(options, key) {
  return requireString(options[key], `--${key.replaceAll("_", "-")}`);
}

function inputOptions(options) {
  return {
    target: requiredOption(options, "target"),
    migrationSetSha256: requiredOption(options, "migration_set"),
    resourceManifestFile: requiredOption(options, "resource_manifest"),
    tenantManifestFile: requiredOption(options, "tenant_manifest"),
    lifecycleRoot: requiredOption(options, "lifecycle_root"),
  };
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  if (command === "write") {
    const receipt = createControlPlaneReceipt({
      ...inputOptions(options),
      sourceSha: requiredOption(options, "source_sha"),
      sourceTree: requiredOption(options, "source_tree"),
    });
    writeControlPlaneReceipt(requiredOption(options, "file"), receipt);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return;
  }
  if (command === "assert") {
    const receipt = assertControlPlaneReceipt({
      file: requiredOption(options, "file"),
      ...inputOptions(options),
    });
    process.stdout.write(`MATCH ${receipt.inputs.migrationSetSha256}\n`);
    return;
  }
  if (command === "inspect") {
    process.stdout.write(`${JSON.stringify(readControlPlaneReceipt(requiredOption(options, "file")))}\n`);
    return;
  }
  fail(`unknown command: ${command ?? "<missing>"}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
