import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const TREE_PATTERN = /^[0-9a-f]{40}$/;
const CONTENT_PATTERN = /^[0-9a-f]{64}$/;
const TARGET_PATTERN = /^(monolith|[a-z][a-z0-9-]*)$/;
const RUN_PATTERN = /^ci-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}-[0-9a-f]{8}$/;
export const SOURCE_VALIDATION_CHECKS = [
  "aggregate-source-ci",
];
export const ARTIFACT_CHECKS = [
  "artifact-compile-or-exact-cache-restore",
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

function requireRunner(runner) {
  if (!new Set(["cnb", "local"]).has(runner)) throw new Error("release runner must be cnb or local");
  return runner;
}

function requireTarget(targetId) {
  if (!TARGET_PATTERN.test(targetId ?? "")) throw new Error("release target id is invalid");
  return targetId;
}

function requireRun(runId) {
  if (!RUN_PATTERN.test(runId ?? "")) throw new Error("source validation CI run id is invalid");
  return runId;
}

export function createSourceValidationReceipt({
  treeId,
  contentDigest,
  targetId,
  runId,
  runner = "cnb",
  completedAt = new Date().toISOString(),
}) {
  return {
    schemaVersion: 3,
    kind: "workspace-source-validation",
    status: "passed",
    command: "ops/publish.sh ci",
    runner: requireRunner(runner),
    treeId: requireTree(treeId),
    contentDigest: requireContent(contentDigest),
    targetId: requireTarget(targetId),
    runId: requireRun(runId),
    scope: targetId === "monolith" ? "full-repository" : "deploy-unit",
    checks: SOURCE_VALIDATION_CHECKS,
    completedAt: requireTime(completedAt),
  };
}

export function validateSourceValidationReceipt(receipt, identity) {
  requireIdentity(receipt, identity);
  const targetId = requireTarget(identity.targetId);
  const runId = requireRun(identity.runId);
  if (receipt.schemaVersion !== 3 || receipt.kind !== "workspace-source-validation"
    || receipt.status !== "passed" || receipt.command !== "ops/publish.sh ci"
    || !new Set(["cnb", "local"]).has(receipt.runner)
    || receipt.targetId !== targetId
    || receipt.runId !== runId
    || receipt.scope !== (targetId === "monolith" ? "full-repository" : "deploy-unit")
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
  if (!TARGET_PATTERN.test(targetId)) throw new Error("artifact target id is invalid");
  return {
    schemaVersion: 1,
    kind: "workspace-release-artifact",
    status: "built",
    command: "ops/publish.sh ci",
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
    || receipt.status !== "built" || receipt.command !== "ops/publish.sh ci"
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
