#!/usr/bin/env node

import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const CANDIDATE_CHECKS = [
  "cnb-release-config",
  "tenant-config-dry-run",
  "tenant-permission-docs",
];
const CNB_GATE_CHECKS = [
  "full-ci",
  "disposable-postgresql-migrations",
  "resource-seed",
  "playwright-e2e",
];

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error(`${label} must be a full lowercase Git SHA`);
  return value;
}

function requireIsoTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("completedAt must be an ISO timestamp");
  }
  return value;
}

function requireIdentity(receipt, { sourceSha, treeSha }) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new Error("release receipt must be an object");
  }
  if (receipt.sourceSha !== requireSha(sourceSha, "source SHA")
    || receipt.treeSha !== requireSha(treeSha, "tree SHA")) {
    throw new Error("release receipt belongs to a different source tree");
  }
  requireIsoTimestamp(receipt.completedAt);
  return receipt;
}

export function createReleaseCandidateReceipt({
  sourceSha,
  treeSha,
  completedAt = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: 1,
    kind: "workspace-release-candidate",
    status: "prepared",
    command: "ops/publish.sh prepare",
    sourceSha: requireSha(sourceSha, "source SHA"),
    treeSha: requireSha(treeSha, "tree SHA"),
    checks: CANDIDATE_CHECKS,
    completedAt: requireIsoTimestamp(completedAt),
  };
}

export function validateReleaseCandidateReceipt(receipt, identity = {}) {
  requireIdentity(receipt, identity);
  if (receipt.schemaVersion !== 1
    || receipt.kind !== "workspace-release-candidate"
    || receipt.status !== "prepared"
    || receipt.command !== "ops/publish.sh prepare"
    || JSON.stringify(receipt.checks) !== JSON.stringify(CANDIDATE_CHECKS)) {
    throw new Error("release candidate receipt contract is invalid");
  }
  return receipt;
}

export function createCnbReleaseGateReceipt({
  sourceSha,
  treeSha,
  completedAt = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: 1,
    kind: "workspace-cnb-release-gate",
    status: "passed",
    command: "ops/run-cnb-release-gate.sh",
    sourceSha: requireSha(sourceSha, "source SHA"),
    treeSha: requireSha(treeSha, "tree SHA"),
    scope: "full-and-unit",
    checks: CNB_GATE_CHECKS,
    completedAt: requireIsoTimestamp(completedAt),
  };
}

export function validateCnbReleaseGateReceipt(receipt, identity = {}) {
  requireIdentity(receipt, identity);
  if (receipt.schemaVersion !== 1
    || receipt.kind !== "workspace-cnb-release-gate"
    || receipt.status !== "passed"
    || receipt.command !== "ops/run-cnb-release-gate.sh"
    || receipt.scope !== "full-and-unit"
    || JSON.stringify(receipt.checks) !== JSON.stringify(CNB_GATE_CHECKS)) {
    throw new Error("CNB release gate receipt contract is invalid");
  }
  return receipt;
}

function parseArguments(argv) {
  const [mode, ...rest] = argv;
  const options = { mode };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key ?? "<empty>"}`);
    const value = rest[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function atomicWriteJson(file, value) {
  const target = resolve(file);
  const temporary = resolve(dirname(target), `.${basename(target)}.tmp-${process.pid}`);
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("release receipt is missing or invalid JSON");
  }
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (!options.source || !options.tree) throw new Error("--source and --tree are required");
  const identity = { sourceSha: options.source, treeSha: options.tree };
  if (options.mode === "candidate-create") {
    if (!options.output) throw new Error("candidate-create requires --output");
    const receipt = createReleaseCandidateReceipt(identity);
    atomicWriteJson(options.output, receipt);
    return receipt;
  }
  if (options.mode === "candidate-verify") {
    if (!options.file) throw new Error("candidate-verify requires --file");
    return validateReleaseCandidateReceipt(readJson(options.file), identity);
  }
  if (options.mode === "cnb-create") {
    if (!options.output) throw new Error("cnb-create requires --output");
    const receipt = createCnbReleaseGateReceipt(identity);
    atomicWriteJson(options.output, receipt);
    return receipt;
  }
  if (options.mode === "cnb-verify") {
    if (!options.file) throw new Error("cnb-verify requires --file");
    return validateCnbReleaseGateReceipt(readJson(options.file), identity);
  }
  throw new Error("usage: release-gate-receipt.mjs candidate-create|candidate-verify|cnb-create|cnb-verify --source SHA --tree SHA --output|--file PATH");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
