#!/usr/bin/env node

import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const UNIT_PATTERN = /^[a-z][a-z0-9-]*$/;
const RECEIPT_KIND = "workspace-local-unit-ci";
const RECEIPT_COMMAND = "scripts/check/run-check-suite.mjs release-unit";

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error(`${label} must be a full lowercase Git SHA`);
  return value;
}

function requireUnitId(value) {
  if (!UNIT_PATTERN.test(value ?? "")) throw new Error("deploy unit id is invalid");
  return value;
}

function requireIsoTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("completedAt must be an ISO timestamp");
  }
  return value;
}

export function createLocalUnitCiReceipt({
  unitId,
  sourceSha,
  treeSha,
  completedAt = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: 1,
    kind: RECEIPT_KIND,
    status: "passed",
    command: RECEIPT_COMMAND,
    unitId: requireUnitId(unitId),
    sourceSha: requireSha(sourceSha, "source SHA"),
    treeSha: requireSha(treeSha, "tree SHA"),
    completedAt: requireIsoTimestamp(completedAt),
  };
}

export function validateLocalUnitCiReceipt(receipt, { unitId, sourceSha, treeSha } = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)
    || receipt.schemaVersion !== 1
    || receipt.kind !== RECEIPT_KIND
    || receipt.status !== "passed"
    || receipt.command !== RECEIPT_COMMAND) {
    throw new Error("local unit CI receipt contract is invalid");
  }
  if (receipt.unitId !== requireUnitId(unitId)
    || receipt.sourceSha !== requireSha(sourceSha, "source SHA")
    || receipt.treeSha !== requireSha(treeSha, "tree SHA")) {
    throw new Error("local unit CI receipt belongs to a different target or source tree");
  }
  requireIsoTimestamp(receipt.completedAt);
  return receipt;
}

export function writeLocalUnitCiReceipt(file, receipt) {
  const target = resolve(file);
  const temporary = resolve(dirname(target), `.${basename(target)}.tmp-${process.pid}`);
  try {
    writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function readLocalUnitCiReceipt(file, expected) {
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("local unit CI receipt is missing or invalid JSON");
  }
  return validateLocalUnitCiReceipt(receipt, expected);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("local-unit-ci-receipt.mjs is a library; use run-local-unit-ci.mjs");
  process.exitCode = 2;
}
