import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  assert, assertDigest, assertIdentifier, canonicalJson, digestEvidence, failureFingerprint,
  normalizeLaneLog, nowIso, safeRepositoryPath, sha256, writeFinal,
} from "./ci-attempt-contract.mjs";

export const DEPLOY_ATTEMPT_SCHEMA = "workspace.deploy-attempt/v1";
export const DEPLOY_CLASSIFICATION_SCHEMA = "workspace.deploy-blocker-classification/v1";
export const DEPLOY_RESOLUTION_SCHEMA = "workspace.deploy-blocker-resolution/v1";
export const DEPLOY_BLOCKED_EXIT_CODE = 43;
export const DEPLOY_RECURRENCE_EXIT_CODE = 42;
const CLASSIFICATIONS = new Set(["candidate-specific", "systemic"]);
const GATES = new Set(["application-ready", "controller-ready"]);
const GIT_OBJECT_ID = /^[a-f0-9]{40}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;

export class DeployBlockerError extends Error {
  constructor(message, blockers, exitCode = DEPLOY_BLOCKED_EXIT_CODE) {
    super(message);
    this.name = "DeployBlockerError";
    this.blockers = blockers;
    this.exitCode = exitCode;
  }
}

function receiptDigest(receipt) {
  return sha256(canonicalJson({ ...receipt, receiptDigest: null }));
}

async function readReceipt(file, schema) {
  const receipt = JSON.parse(await readFile(file, "utf8"));
  assert(receipt?.schema === schema, `unsupported receipt schema: ${file}`);
  assert(receipt.receiptDigest === receiptDigest(receipt), `receipt digest mismatch: ${file}`);
  return receipt;
}

async function listReceipts(directory, schema) {
  const files = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(target);
    }
  }
  await walk(directory);
  const receipts = [];
  for (const file of files.sort()) receipts.push(await readReceipt(file, schema));
  return receipts;
}

function requireGitObjectId(value, label) {
  assert(typeof value === "string" && GIT_OBJECT_ID.test(value), `${label} must be a full Git object id`);
}

function requireCommit(value, label) {
  requireGitObjectId(value, label);
}

function requireTimestamp(value, label) {
  const milliseconds = Date.parse(value);
  assert(Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value, `${label} must be a canonical ISO timestamp`);
  return milliseconds;
}

function requireFingerprint(value) {
  assert(typeof value === "string" && FINGERPRINT.test(value), "fingerprint must be SHA-256");
}

function git(repository, args) {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function assertTrackedAtCommit(repository, commit, fixturePath) {
  const safe = safeRepositoryPath(repository, fixturePath);
  let objectType;
  try {
    objectType = git(repository, ["cat-file", "-t", `${commit}:${safe.relative}`]);
  } catch {
    objectType = null;
  }
  assert(objectType === "blob", "fixture must be a tracked file at fixing commit");
  return safe.relative;
}

function isAncestor(repository, ancestor, descendant) {
  try {
    execFileSync("git", ["-C", repository, "merge-base", "--is-ancestor", ancestor, descendant], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function verifyGateReceipt({ repository, fixingCommit, gate, gateReceipt }) {
  const safe = safeRepositoryPath(repository, gateReceipt);
  let receipt;
  try {
    receipt = JSON.parse(await readFile(safe.absolute, "utf8"));
  } catch (error) {
    throw new Error(`gate receipt is missing or invalid JSON: ${error.message}`);
  }
  let gateCommit;
  if (gate === "application-ready") {
    assert(receipt?.schemaVersion === 1 && receipt.kind === "workspace-ready-artifact"
      && receipt.status === "ready" && receipt.command === "ops/publish.sh ci",
    "application-ready gate receipt contract is invalid");
    gateCommit = receipt.source?.commitSha;
  } else {
    assert(receipt?.schemaVersion === 2 && receipt.kind === "workspace-controller-ready"
      && receipt.status === "ready" && receipt.command === "ops/publish.sh controller-ready",
    "controller-ready gate receipt contract is invalid");
    const { receiptDigest: declaredDigest, ...body } = receipt;
    assert(declaredDigest === sha256(JSON.stringify(body)), "controller-ready gate receipt digest mismatch");
    gateCommit = receipt.controller?.sourceSha;
  }
  requireCommit(gateCommit, `${gate} gate commit`);
  assert(isAncestor(repository, fixingCommit, gateCommit), `${gate} gate receipt does not contain the fixing commit`);
  const [evidence] = await digestEvidence(repository, [`${gate}-receipt:${gateReceipt}`]);
  return evidence;
}

export async function recordDeployAttempt(options) {
  const {
    root, repository, attemptId, target, targetMode, source, controller, commandId,
    startedAt, completedAt, status, exitCode, log,
  } = options;
  assertIdentifier(attemptId, "deploy attempt id");
  assertIdentifier(target, "deploy target");
  assertIdentifier(targetMode, "deploy target mode");
  assertIdentifier(commandId, "deploy command id");
  assert(["succeeded", "failed", "cancelled"].includes(status), "unsupported deploy status");
  assert(Number.isInteger(exitCode) && exitCode >= 0, "deploy exit code must be nonnegative");
  assert(status === "succeeded" ? exitCode === 0 : exitCode !== 0, "deploy status and exit code disagree");
  requireCommit(source.commit, "source commit");
  requireGitObjectId(source.tree, "source tree");
  assertDigest(source.contentDigest, "source content digest");
  requireCommit(controller.commit, "controller commit");
  requireGitObjectId(controller.tree, "controller tree");
  assertDigest(controller.digest, "controller digest");
  const startedAtMs = requireTimestamp(startedAt, "deploy start");
  const completedAtMs = requireTimestamp(completedAt, "deploy completion");
  assert(completedAtMs >= startedAtMs, "deploy completion must not precede start");
  const evidence = await digestEvidence(repository, [`deploy-log:${log}`]);
  const normalizedMessageDigest = sha256(normalizeLaneLog(await readFile(safeRepositoryPath(repository, log).absolute, "utf8")));
  const commandDigest = sha256(commandId);
  const fingerprint = status === "failed" ? failureFingerprint({
    lane: "deploy", commandDigest, errorCode: "deploy-command-failed", exitCode, normalizedMessageDigest,
  }) : null;
  const receipt = {
    schema: DEPLOY_ATTEMPT_SCHEMA,
    kind: "workspace-deploy-attempt",
    attemptId,
    target,
    targetMode,
    source,
    controller,
    command: { id: commandId, digest: commandDigest },
    status,
    exitCode,
    startedAt,
    completedAt,
    durationMs: completedAtMs - startedAtMs,
    evidence,
    failure: fingerprint ? { errorCode: "deploy-command-failed", normalizedMessageDigest, fingerprint } : null,
    receiptDigest: null,
  };
  receipt.receiptDigest = receiptDigest(receipt);
  await writeFinal(path.join(root, "attempts", `${attemptId}.json`), receipt);
  return receipt;
}

export async function classifyDeployBlocker(options) {
  const { root, fingerprint, classification, reasonCode, decisionId, clock = nowIso } = options;
  requireFingerprint(fingerprint);
  assert(CLASSIFICATIONS.has(classification), "classification must be candidate-specific or systemic");
  assertIdentifier(reasonCode, "classification reason code");
  assertIdentifier(decisionId, "classification decision id");
  const attempts = await listReceipts(path.join(root, "attempts"), DEPLOY_ATTEMPT_SCHEMA);
  assert(attempts.some((attempt) => attempt.failure?.fingerprint === fingerprint), "classification fingerprint has no deploy failure");
  const prior = (await listReceipts(path.join(root, "classifications", fingerprint), DEPLOY_CLASSIFICATION_SCHEMA))
    .sort((left, right) => left.classifiedAt.localeCompare(right.classifiedAt));
  const current = prior.at(-1)?.classification;
  assert(!current || (current === "candidate-specific" && classification === "systemic"), "classification may only escalate from candidate-specific to systemic");
  const receipt = {
    schema: DEPLOY_CLASSIFICATION_SCHEMA,
    kind: "workspace-deploy-blocker-classification",
    decisionId,
    fingerprint,
    classification,
    reasonCode,
    classifiedAt: clock(),
    receiptDigest: null,
  };
  receipt.receiptDigest = receiptDigest(receipt);
  await writeFinal(path.join(root, "classifications", fingerprint, `${decisionId}.json`), receipt);
  return receipt;
}

export async function resolveSystemicDeployBlocker(options) {
  const {
    root, repository, fingerprint, resolutionId, fixingCommit, gate, fixturePath, gateReceipt,
    clock = nowIso,
  } = options;
  requireFingerprint(fingerprint);
  assertIdentifier(resolutionId, "resolution id");
  requireCommit(fixingCommit, "fixing commit");
  assert(GATES.has(gate), "resolution gate is unsupported");
  const classifications = (await listReceipts(path.join(root, "classifications", fingerprint), DEPLOY_CLASSIFICATION_SCHEMA))
    .sort((left, right) => left.classifiedAt.localeCompare(right.classifiedAt));
  assert(classifications.at(-1)?.classification === "systemic", "only a systemic blocker can be resolved");
  git(repository, ["cat-file", "-e", `${fixingCommit}^{commit}`]);
  const fixture = assertTrackedAtCommit(repository, fixingCommit, fixturePath);
  const gateEvidence = await verifyGateReceipt({ repository, fixingCommit, gate, gateReceipt });
  const receipt = {
    schema: DEPLOY_RESOLUTION_SCHEMA,
    kind: "workspace-deploy-blocker-resolution",
    resolutionId,
    fingerprint,
    fixingCommit,
    gate,
    fixture,
    gateEvidence,
    resolvedAt: clock(),
    receiptDigest: null,
  };
  receipt.receiptDigest = receiptDigest(receipt);
  await writeFinal(path.join(root, "resolutions", fingerprint, `${resolutionId}.json`), receipt);
  return receipt;
}

async function ledgerState(root) {
  const attempts = await listReceipts(path.join(root, "attempts"), DEPLOY_ATTEMPT_SCHEMA);
  const classifications = await listReceipts(path.join(root, "classifications"), DEPLOY_CLASSIFICATION_SCHEMA);
  const resolutions = await listReceipts(path.join(root, "resolutions"), DEPLOY_RESOLUTION_SCHEMA);
  const latestClassification = new Map();
  for (const item of classifications.sort((left, right) => left.classifiedAt.localeCompare(right.classifiedAt))) {
    latestClassification.set(item.fingerprint, item);
  }
  const latestResolution = new Map();
  for (const item of resolutions.sort((left, right) => left.resolvedAt.localeCompare(right.resolvedAt))) {
    latestResolution.set(item.fingerprint, item);
  }
  return { attempts, latestClassification, latestResolution };
}

export async function inspectDeployBlockers(options) {
  const { root, target, targetMode } = options;
  const state = await ledgerState(root);
  const failures = state.attempts.filter((attempt) => (
    attempt.status === "failed" && (!target || attempt.target === target) && (!targetMode || attempt.targetMode === targetMode)
  ));
  const grouped = new Map();
  for (const failure of failures) {
    const fingerprint = failure.failure.fingerprint;
    grouped.set(fingerprint, [...(grouped.get(fingerprint) ?? []), failure]);
  }
  return [...grouped.entries()].map(([fingerprint, items]) => ({
    fingerprint,
    attempts: items.map((item) => item.attemptId),
    contents: [...new Set(items.map((item) => item.source.contentDigest))].sort(),
    classification: state.latestClassification.get(fingerprint) ?? null,
    resolution: state.latestResolution.get(fingerprint) ?? null,
    lastFailedAt: items.map((item) => item.completedAt).sort().at(-1),
  })).sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
}

export async function assertDeployRetry(options) {
  const {
    root, repository, target, targetMode, sourceContentDigest, sourceCommit, controllerCommit,
  } = options;
  assertIdentifier(target, "deploy target");
  assertIdentifier(targetMode, "deploy target mode");
  assertDigest(sourceContentDigest, "source content digest");
  requireCommit(sourceCommit, "source commit");
  requireCommit(controllerCommit, "controller commit");
  const groups = await inspectDeployBlockers({ root, target, targetMode });
  const blockers = [];
  const recurrences = [];
  for (const group of groups) {
    const classification = group.classification?.classification;
    if (!classification) {
      blockers.push({ fingerprint: group.fingerprint, reason: "unclassified" });
      continue;
    }
    if (classification === "candidate-specific") {
      if (group.contents.length > 1) recurrences.push({ fingerprint: group.fingerprint, reason: "candidate-specific-recurred-across-candidates" });
      else if (group.contents.includes(sourceContentDigest)) blockers.push({ fingerprint: group.fingerprint, reason: "same-candidate-retry" });
      continue;
    }
    const resolution = group.resolution;
    if (!resolution) {
      blockers.push({ fingerprint: group.fingerprint, reason: "systemic-unresolved" });
      continue;
    }
    const gateCommit = resolution.gate === "application-ready" ? sourceCommit : controllerCommit;
    if (!isAncestor(repository, resolution.fixingCommit, gateCommit)) {
      blockers.push({ fingerprint: group.fingerprint, reason: "fix-not-covered-by-current-gate" });
      continue;
    }
    try {
      assertTrackedAtCommit(repository, resolution.fixingCommit, resolution.fixture);
    } catch {
      blockers.push({ fingerprint: group.fingerprint, reason: "fixture-proof-invalid" });
      continue;
    }
    if (group.lastFailedAt > resolution.resolvedAt) {
      recurrences.push({ fingerprint: group.fingerprint, reason: "resolved-systemic-blocker-recurred" });
    }
  }
  if (recurrences.length) throw new DeployBlockerError(`P1: ${recurrences.length} resolved or misclassified deploy blocker(s) recurred`, recurrences, DEPLOY_RECURRENCE_EXIT_CODE);
  if (blockers.length) throw new DeployBlockerError(`${blockers.length} deploy blocker(s) must be classified or resolved before retry`, blockers);
  return { checked: groups.length, blockers: [], recurrences: [] };
}

export async function patrolDeployBlockers({ root }) {
  const groups = await inspectDeployBlockers({ root });
  const unresolved = groups.filter((group) => !group.classification || (
    group.classification.classification === "systemic" && !group.resolution
  ));
  const recurrences = groups.filter((group) => (
    (group.classification?.classification === "candidate-specific" && group.contents.length > 1)
    || (group.resolution && group.lastFailedAt > group.resolution.resolvedAt)
  ));
  if (recurrences.length) throw new DeployBlockerError(`P1: ${recurrences.length} deploy blocker(s) recurred`, recurrences, DEPLOY_RECURRENCE_EXIT_CODE);
  if (unresolved.length) throw new DeployBlockerError(`${unresolved.length} deploy blocker(s) remain unresolved`, unresolved);
  return { checked: groups.length, unresolved: [], recurrences: [] };
}
