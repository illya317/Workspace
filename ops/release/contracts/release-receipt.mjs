import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const TREE_PATTERN = /^[0-9a-f]{40}$/;
const CONTENT_PATTERN = /^[0-9a-f]{64}$/;
export const CANDIDATE_CHECKS = [
  "cnb-release-config",
  "tenant-config-dry-run",
  "tenant-permission-docs",
];
export const SOURCE_VALIDATION_CHECKS = [
  "full-source-ci-once",
];
export const ARTIFACT_CHECKS = [
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

function requireRunner(runner) {
  if (!new Set(["cnb", "local"]).has(runner)) throw new Error("release runner must be cnb or local");
  return runner;
}

export function createSourceValidationReceipt({
  treeId,
  contentDigest,
  runner = "cnb",
  completedAt = new Date().toISOString(),
}) {
  return {
    schemaVersion: 1,
    kind: "workspace-source-validation",
    status: "passed",
    command: "ops/publish.sh validate",
    runner: requireRunner(runner),
    treeId: requireTree(treeId),
    contentDigest: requireContent(contentDigest),
    scope: "full-repository",
    checks: SOURCE_VALIDATION_CHECKS,
    completedAt: requireTime(completedAt),
  };
}

export function validateSourceValidationReceipt(receipt, identity) {
  requireIdentity(receipt, identity);
  if (receipt.schemaVersion !== 1 || receipt.kind !== "workspace-source-validation"
    || receipt.status !== "passed" || receipt.command !== "ops/publish.sh validate"
    || !new Set(["cnb", "local"]).has(receipt.runner) || receipt.scope !== "full-repository"
    || JSON.stringify(receipt.checks) !== JSON.stringify(SOURCE_VALIDATION_CHECKS)) {
    throw new Error("source validation receipt contract is invalid");
  }
  return receipt;
}

export function createArtifactReceipt({
  treeId,
  contentDigest,
  targetId = "monolith",
  runner = "cnb",
  completedAt = new Date().toISOString(),
}) {
  if (!/^(monolith|[a-z][a-z0-9-]*)$/.test(targetId)) throw new Error("artifact target id is invalid");
  return {
    schemaVersion: 1,
    kind: "workspace-release-artifact",
    status: "built",
    command: "ops/publish.sh build",
    runner: requireRunner(runner),
    treeId: requireTree(treeId),
    contentDigest: requireContent(contentDigest),
    targetId,
    checks: ARTIFACT_CHECKS,
    completedAt: requireTime(completedAt),
  };
}

export function validateArtifactReceipt(receipt, identity) {
  requireIdentity(receipt, identity);
  if (receipt.schemaVersion !== 1 || receipt.kind !== "workspace-release-artifact"
    || receipt.status !== "built" || receipt.command !== "ops/publish.sh build"
    || !new Set(["cnb", "local"]).has(receipt.runner)
    || receipt.targetId !== (identity.targetId ?? "monolith")
    || JSON.stringify(receipt.checks) !== JSON.stringify(ARTIFACT_CHECKS)) {
    throw new Error("release artifact receipt contract is invalid");
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
