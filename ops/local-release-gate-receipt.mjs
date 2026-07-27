#!/usr/bin/env node

import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateLocalFullCiReceipt } from "../scripts/ci/local-full-ci-receipt.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RECEIPT_KIND = "workspace-local-release-gate";
const RECEIPT_COMMAND = "ops/local-release-gate.sh";
const CHECKS = [
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

export function createLocalReleaseGateReceipt({
  sourceSha,
  treeSha,
  fullCiReceipt,
  completedAt = new Date().toISOString(),
} = {}) {
  const exactTree = requireSha(treeSha, "tree SHA");
  return {
    schemaVersion: 2,
    kind: RECEIPT_KIND,
    status: "passed",
    command: RECEIPT_COMMAND,
    sourceSha: requireSha(sourceSha, "source SHA"),
    treeSha: exactTree,
    checks: CHECKS,
    fullCi: validateLocalFullCiReceipt(fullCiReceipt, { treeSha: exactTree }),
    completedAt: requireIsoTimestamp(completedAt),
  };
}

export function validateLocalReleaseGateReceipt(receipt, { sourceSha, treeSha } = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new Error("local release gate receipt must be an object");
  }
  const exactSource = requireSha(sourceSha, "source SHA");
  const exactTree = requireSha(treeSha, "tree SHA");
  if (receipt.schemaVersion !== 2
    || receipt.kind !== RECEIPT_KIND
    || receipt.status !== "passed"
    || receipt.command !== RECEIPT_COMMAND
    || JSON.stringify(receipt.checks) !== JSON.stringify(CHECKS)) {
    throw new Error("local release gate receipt contract is invalid");
  }
  if (receipt.sourceSha !== exactSource || receipt.treeSha !== exactTree) {
    throw new Error("local release gate receipt belongs to a different source tree");
  }
  validateLocalFullCiReceipt(receipt.fullCi, { treeSha: exactTree });
  requireIsoTimestamp(receipt.completedAt);
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

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`${label} is missing or invalid JSON`);
  }
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (!options.source || !options.tree) throw new Error("--source and --tree are required");
  if (options.mode === "create") {
    if (!options.output || !options.full_ci) throw new Error("create requires --full-ci and --output");
    const receipt = createLocalReleaseGateReceipt({
      sourceSha: options.source,
      treeSha: options.tree,
      fullCiReceipt: readJson(options.full_ci, "local full CI receipt"),
    });
    atomicWriteJson(options.output, receipt);
    return receipt;
  }
  if (options.mode === "verify") {
    if (!options.file) throw new Error("verify requires --file");
    const receipt = validateLocalReleaseGateReceipt(
      readJson(options.file, "local release gate receipt"),
      { sourceSha: options.source, treeSha: options.tree },
    );
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return receipt;
  }
  throw new Error("usage: local-release-gate-receipt.mjs create|verify --source SHA --tree SHA [--full-ci FILE --output FILE|--file FILE]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
