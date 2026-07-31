import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const TREE_PATTERN = /^[0-9a-f]{40}$/;
const CONTENT_PATTERN = /^[0-9a-f]{64}$/;
export const CANDIDATE_CHECKS = [
  "cnb-release-config",
  "tenant-config-dry-run",
  "tenant-permission-docs",
];
export const VALIDATION_CHECKS = [
  "full-source-ci-once",
  "artifact-compile-once",
  "artifact-content-identity",
];

function requireTree(value) {
  if (!TREE_PATTERN.test(value ?? "")) throw new Error("tree id must be a full lowercase Git tree id");
  return value;
}

function requireContent(value) {
  if (!CONTENT_PATTERN.test(value ?? "")) throw new Error("content digest must be lowercase SHA-256");
  return value;
}

function requireTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error("completedAt must be an ISO timestamp");
  return value;
}

function requireIdentity(receipt, expected) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("release receipt must be an object");
  if (receipt.treeId !== requireTree(expected.treeId) || receipt.contentDigest !== requireContent(expected.contentDigest)) {
    throw new Error("release receipt belongs to different candidate content");
  }
  requireTime(receipt.completedAt);
  return receipt;
}

export function createCandidateReceipt({ treeId, contentDigest, completedAt = new Date().toISOString() }) {
  return {
    schemaVersion: 2,
    kind: "workspace-release-candidate",
    status: "prepared",
    command: "ops/publish.sh prepare",
    treeId: requireTree(treeId),
    contentDigest: requireContent(contentDigest),
    checks: CANDIDATE_CHECKS,
    completedAt: requireTime(completedAt),
  };
}

export function validateCandidateReceipt(receipt, identity) {
  requireIdentity(receipt, identity);
  if (receipt.schemaVersion !== 2 || receipt.kind !== "workspace-release-candidate"
    || receipt.status !== "prepared" || receipt.command !== "ops/publish.sh prepare"
    || JSON.stringify(receipt.checks) !== JSON.stringify(CANDIDATE_CHECKS)) {
    throw new Error("release candidate receipt contract is invalid");
  }
  return receipt;
}

export function createValidationReceipt({
  treeId,
  contentDigest,
  runner = "cnb",
  completedAt = new Date().toISOString(),
}) {
  if (!new Set(["cnb", "local"]).has(runner)) throw new Error("validation runner must be cnb or local");
  return {
    schemaVersion: 3,
    kind: "workspace-release-validation",
    status: "passed",
    command: "ops/publish.sh validate",
    runner,
    treeId: requireTree(treeId),
    contentDigest: requireContent(contentDigest),
    scope: "full-repository",
    checks: VALIDATION_CHECKS,
    completedAt: requireTime(completedAt),
  };
}

export function validateValidationReceipt(receipt, identity) {
  requireIdentity(receipt, identity);
  if (receipt.schemaVersion !== 3 || receipt.kind !== "workspace-release-validation"
    || receipt.status !== "passed" || receipt.command !== "ops/publish.sh validate"
    || !new Set(["cnb", "local"]).has(receipt.runner) || receipt.scope !== "full-repository"
    || JSON.stringify(receipt.checks) !== JSON.stringify(VALIDATION_CHECKS)) {
    throw new Error("release validation receipt contract is invalid");
  }
  return receipt;
}

export function atomicWriteReceipt(file, receipt) {
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

export function readReceipt(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("release receipt is missing or invalid JSON");
  }
}
